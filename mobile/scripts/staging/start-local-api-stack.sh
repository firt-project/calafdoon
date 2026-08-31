#!/usr/bin/env bash
# Start the complete local API-mode stack (data plane + Nest + Next).
# Does NOT reset the database. Does NOT touch production.
#
# Usage (from repo root):
#   npm run stack:local:api
#   ./scripts/staging/start-local-api-stack.sh
#
# Requires: Docker Compose access for postgres/redis/minio OR already-running data plane.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

API_PORT="${API_PORT:-4001}"
NEXT_PORT="${NEXT_PORT:-3020}"
COMPOSE=(docker compose -f infra/docker-compose.yml)

echo "==> Hel Calafkaaga local API stack"
echo "    API_PORT=$API_PORT NEXT_PORT=$NEXT_PORT"

if docker info >/dev/null 2>&1; then
  echo "==> Starting postgres redis minio minio-init"
  "${COMPOSE[@]}" up -d postgres redis minio minio-init
  echo "==> Waiting for healthchecks"
  for i in $(seq 1 60); do
    pg_ok="$("${COMPOSE[@]}" exec -T postgres pg_isready -U hel -d hel_calafkaaga >/dev/null 2>&1 && echo 1 || echo 0)"
    redis_ok="$("${COMPOSE[@]}" exec -T redis redis-cli ping 2>/dev/null | tr -d '\r' || true)"
    minio_ok="$(curl -sf http://127.0.0.1:9000/minio/health/live >/dev/null && echo 1 || echo 0)"
    if [[ "$pg_ok" == "1" && "$redis_ok" == "PONG" && "$minio_ok" == "1" ]]; then
      echo "    data plane healthy"
      break
    fi
    if [[ "$i" -eq 60 ]]; then
      echo "ERROR: data plane not healthy after 60s" >&2
      exit 1
    fi
    sleep 1
  done
else
  echo "WARN: docker CLI unavailable — assuming postgres/redis/minio already running on loopback"
  curl -sf http://127.0.0.1:9000/minio/health/live >/dev/null || {
    echo "ERROR: MinIO not reachable at :9000" >&2
    exit 1
  }
fi

mkdir -p /tmp/hel-stack-logs

if ! curl -sf "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1; then
  echo "==> Starting Nest API on :${API_PORT}"
  (
    cd apps/api
    export PORT="$API_PORT"
    export STRIPE_GATEWAY="${STRIPE_GATEWAY:-fake}"
    export MAIL_DRIVER="${MAIL_DRIVER:-console}"
    export COOKIE_SECURE="${COOKIE_SECURE:-false}"
    export CORS_ORIGINS="${CORS_ORIGINS:-http://127.0.0.1:${NEXT_PORT},http://localhost:${NEXT_PORT}}"
    export APP_URL="${APP_URL:-http://127.0.0.1:${NEXT_PORT}}"
    export REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
    npx nest start
  ) >/tmp/hel-stack-logs/api.log 2>&1 &
  echo $! >/tmp/hel-stack-logs/api.pid
  for i in $(seq 1 90); do
    if curl -sf "http://127.0.0.1:${API_PORT}/health" >/dev/null; then
      echo "    API healthy"
      break
    fi
    if [[ "$i" -eq 90 ]]; then
      echo "ERROR: API failed to become healthy — see /tmp/hel-stack-logs/api.log" >&2
      exit 1
    fi
    sleep 1
  done
else
  echo "==> Nest already healthy on :${API_PORT}"
fi

if ! curl -sf "http://127.0.0.1:${NEXT_PORT}/" >/dev/null 2>&1; then
  echo "==> Starting Next.js (BACKEND_PROVIDER=api) on :${NEXT_PORT}"
  (
    export NEXT_PUBLIC_BACKEND_PROVIDER=api
    export NEXT_PUBLIC_API_URL="http://127.0.0.1:${API_PORT}"
    export NEXT_PUBLIC_SOCKET_URL="http://127.0.0.1:${API_PORT}"
    export NEXT_PUBLIC_SHADOW_READS_ENABLED=false
    npx next dev -p "$NEXT_PORT"
  ) >/tmp/hel-stack-logs/next.log 2>&1 &
  echo $! >/tmp/hel-stack-logs/next.pid
  for i in $(seq 1 120); do
    if curl -sf "http://127.0.0.1:${NEXT_PORT}/" >/dev/null; then
      echo "    Next healthy"
      break
    fi
    if [[ "$i" -eq 120 ]]; then
      echo "ERROR: Next failed — see /tmp/hel-stack-logs/next.log" >&2
      exit 1
    fi
    sleep 1
  done
else
  echo "==> Next already responding on :${NEXT_PORT} (ensure BACKEND_PROVIDER=api)"
fi

echo "==> Stack ready"
echo "    API:  http://127.0.0.1:${API_PORT}/health"
echo "    Next: http://127.0.0.1:${NEXT_PORT}"
echo "    Logs: /tmp/hel-stack-logs/"
curl -s "http://127.0.0.1:${API_PORT}/health" || true
echo
