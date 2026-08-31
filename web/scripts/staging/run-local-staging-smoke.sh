#!/usr/bin/env bash
# Local staging smoke checks (loopback only). Does not deploy.
# Expects Nest API on STAGING_API_URL (default http://127.0.0.1:4000)
# and optionally Next on STAGING_BASE_URL (default http://127.0.0.1:3000).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
API_URL="${STAGING_API_URL:-${NEXT_PUBLIC_API_URL:-http://127.0.0.1:4000}}"
BASE_URL="${STAGING_BASE_URL:-http://127.0.0.1:3000}"
OUT_DIR="$ROOT/migration-reports/phase11"
mkdir -p "$OUT_DIR"
REPORT="$OUT_DIR/local-staging-smoke.json"

API_URL="${API_URL%/}"
BASE_URL="${BASE_URL%/}"

api_ok=false
next_ok=false
api_status=0
next_status=0

if curl -fsS --max-time 5 "$API_URL/health" >/tmp/hel-api-health.json 2>/dev/null; then
  api_ok=true
  api_status=200
else
  api_status=0
fi

if curl -fsS --max-time 5 -o /dev/null -w "%{http_code}" "$BASE_URL" >/tmp/hel-next-status.txt 2>/dev/null; then
  next_status=$(cat /tmp/hel-next-status.txt)
  if [[ "$next_status" =~ ^[23] ]]; then
    next_ok=true
  fi
fi

counts_ok=false
if [[ -n "${DATABASE_URL:-}" ]]; then
  if (cd "$ROOT" && DATABASE_URL="$DATABASE_URL" npx tsx scripts/staging/validate-counts.ts) >/tmp/hel-counts.log 2>&1; then
    counts_ok=true
  fi
fi

deps_ok=false
if (cd "$ROOT" && node scripts/report-direct-convex-deps.mjs) >/tmp/hel-deps.log 2>&1; then
  deps_ok=true
fi

cat >"$REPORT" <<EOF
{
  "generatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "apiUrl": "$API_URL",
  "baseUrl": "$BASE_URL",
  "apiHealth": { "ok": $api_ok, "status": $api_status },
  "nextReachable": { "ok": $next_ok, "status": $next_status },
  "validateCounts": { "ok": $counts_ok, "ran": $([ -n "${DATABASE_URL:-}" ] && echo true || echo false) },
  "convexDepsReport": { "ok": $deps_ok },
  "pass": $([[ "$api_ok" == true ]] && echo true || echo false),
  "notes": [
    "Cloud staging deploy is out of scope for this script.",
    "Start API: npm run dev:api (or docker compose api).",
    "Start Next in API mode: NEXT_PUBLIC_BACKEND_PROVIDER=api NEXT_PUBLIC_API_URL=$API_URL npm run dev:next"
  ]
}
EOF

echo "Wrote $REPORT"
cat "$REPORT"

if [[ "$api_ok" != true ]]; then
  echo "FAIL: API not healthy at $API_URL/health" >&2
  exit 1
fi
