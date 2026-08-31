#!/usr/bin/env bash
# Phase 12 local validation orchestrator.
# Does not switch production. Does not require cloud credentials.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
OUT="$ROOT/migration-reports/phase12"
mkdir -p "$OUT"

API_URL="${STAGING_API_URL:-http://127.0.0.1:4001}"
BASE_URL="${STAGING_BASE_URL:-http://127.0.0.1:3000}"

echo "==> convex deps"
npm run frontend:convex-deps:check

echo "==> prisma validate"
npm run prisma:validate

echo "==> API unit tests"
STRIPE_GATEWAY=fake npm test -w @hel/api

echo "==> frontend + shadow tests"
npm run test:frontend

echo "==> API tsc"
npm run lint -w @hel/api

echo "==> health"
curl -sf "$API_URL/health" | tee "$OUT/health-snapshot.json"
echo

echo "==> load smoke"
STAGING_API_URL="$API_URL" npm run staging:load-smoke || true

echo "==> media validation"
DATABASE_URL="${DATABASE_URL:-}" npm run staging:validate-media || true

echo "==> payment reconcile audit"
npm run payment:reconcile-audit -w @hel/api || true

cat >"$OUT/local-validation.json" <<EOF
{
  "generatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "apiUrl": "$API_URL",
  "baseUrl": "$BASE_URL",
  "note": "See sibling JSON reports for detailed results. Playwright requires STAGING_E2E=1 and API-mode Next."
}
EOF

echo "Phase 12 local validation pass (core). Run Playwright separately with STAGING_E2E=1."
