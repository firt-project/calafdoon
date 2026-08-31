#!/usr/bin/env bash
# Staging seed from local Postgres — DOCUMENTATION + optional local helpers.
# Does NOT deploy. Does NOT touch production Convex or live Stripe/Resend.
#
# Usage:
#   ./scripts/staging/seed-from-local.sh
#   ./scripts/staging/seed-from-local.sh --print-only   # default: print commands
#   DATABASE_URL=… ./scripts/staging/seed-from-local.sh --clean-fixtures
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MODE="${1:---print-only}"

print_commands() {
  cat <<EOF
# Hel Calafkaaga — seed staging DB from local dump

## Auth policy (staging)
Only allowlisted test accounts may authenticate in staging E2E.
Seed them with: npm run staging:seed-users
Default passwords live in scripts/staging/seed-staging-test-users.ts (local/dev only).

## 0) Clean local fixtures (optional)

psql "\$DATABASE_URL" -f scripts/staging/prepare-fixture-clean.sql

## 1) Dump local

export LOCAL_DATABASE_URL="\${LOCAL_DATABASE_URL:-postgres://hel:hel_dev_change_me@127.0.0.1:5432/hel_calafkaaga}"
pg_dump "\$LOCAL_DATABASE_URL" \\
  --format=custom \\
  --no-owner \\
  --no-acl \\
  -f /tmp/hel-local.dump

## 2) Restore to staging (cloud staging TBD — BLOCKER if no host)

export STAGING_DATABASE_URL='\${STAGING_DATABASE_URL:?set staging URL}'
# cd apps/api && DATABASE_URL="\$STAGING_DATABASE_URL" npx prisma migrate deploy
pg_restore \\
  --clean \\
  --if-exists \\
  --no-owner \\
  --no-acl \\
  -d "\$STAGING_DATABASE_URL" \\
  /tmp/hel-local.dump

## 3) Optional anonymize

psql "\$STAGING_DATABASE_URL" -f scripts/staging/anonymize-optional.sql

## 4) Seed allowlisted staging E2E users

DATABASE_URL="\$STAGING_DATABASE_URL" npm run staging:seed-users

## 5) Validate counts

DATABASE_URL="\$STAGING_DATABASE_URL" npm run staging:validate-counts

## 6) Local staging smoke (API + Next on loopback)

npm run staging:local-smoke
EOF
}

case "$MODE" in
  --print-only|"")
    print_commands
    ;;
  --clean-fixtures)
    : "${DATABASE_URL:?DATABASE_URL required}"
    if command -v psql >/dev/null 2>&1; then
      psql "$DATABASE_URL" -f "$ROOT/scripts/staging/prepare-fixture-clean.sql"
    else
      echo "psql not installed — run SQL via docker:"
      echo "  docker compose -f infra/docker-compose.yml exec -T postgres \\"
      echo "    psql -U hel -d hel_calafkaaga < scripts/staging/prepare-fixture-clean.sql"
      exit 1
    fi
    ;;
  *)
    echo "Unknown mode: $MODE (use --print-only or --clean-fixtures)" >&2
    exit 1
    ;;
esac
