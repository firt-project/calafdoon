#!/usr/bin/env bash
# Lightweight API smoke against a deployed environment (staging/prod).
# Does not create accounts or mutate data beyond health probes.
#
# Usage:
#   API_BASE=https://api.staging.example.com ./scripts/ops/health-smoke.sh
set -euo pipefail

API_BASE="${API_BASE:?API_BASE required, e.g. https://api.example.com}"
API_BASE="${API_BASE%/}"

echo "GET $API_BASE/health/live"
curl -fsS "$API_BASE/health/live" | head -c 500
echo
echo "GET $API_BASE/health/ready"
code="$(curl -sS -o /tmp/hel-ready.json -w '%{http_code}' "$API_BASE/health/ready" || true)"
cat /tmp/hel-ready.json
echo
if [[ "$code" != "200" ]]; then
  echo "FAIL: ready returned HTTP $code" >&2
  exit 1
fi
echo "OK: health smoke passed"
