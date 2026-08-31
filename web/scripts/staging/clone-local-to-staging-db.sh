#!/usr/bin/env bash
# Create a local staging DB copy from the canonical migrated database.
# Does NOT modify the canonical DB.
#
# Usage:
#   ./scripts/staging/clone-local-to-staging-db.sh
#   STAGING_DB_NAME=hel_staging_phase12 ./scripts/staging/clone-local-to-staging-db.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# shellcheck disable=SC1091
if [[ -f "$ROOT/apps/api/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source <(grep -E '^(DATABASE_URL)=' "$ROOT/apps/api/.env" | sed 's/\r$//')
  set +a
fi

LOCAL_URL="${LOCAL_DATABASE_URL:-${DATABASE_URL:-postgresql://hel:hel_dev_change_me@127.0.0.1:5432/hel_calafkaaga?schema=public}}"
STAGING_DB_NAME="${STAGING_DB_NAME:-hel_staging_phase12}"
DUMP="/tmp/hel-canonical-$$.dump"

# Strip query string for pg tools
base_url="${LOCAL_URL%%\?*}"
# Derive admin URL (postgres db) and staging URL
admin_url="$(echo "$base_url" | sed -E 's#/[^/]+$#/postgres#')"
staging_url="$(echo "$base_url" | sed -E "s#/[^/]+\$#/${STAGING_DB_NAME}#")"

echo "Canonical: ${base_url//:*@/:***@}"
echo "Staging:   ${staging_url//:*@/:***@}"

if command -v pg_dump >/dev/null 2>&1; then
  pg_dump "$base_url" --format=custom --no-owner --no-acl -f "$DUMP"
  psql "$admin_url" -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${STAGING_DB_NAME}' AND pid <> pg_backend_pid();" || true
  psql "$admin_url" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${STAGING_DB_NAME};"
  psql "$admin_url" -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${STAGING_DB_NAME};"
  pg_restore --no-owner --no-acl -d "$staging_url" "$DUMP"
  rm -f "$DUMP"
else
  echo "pg_dump/psql not on PATH — use Docker:"
  echo "  docker compose -f infra/docker-compose.yml exec -T postgres \\"
  echo "    pg_dump -U hel -d hel_calafkaaga -Fc -f /tmp/hel.dump"
  echo "  docker compose -f infra/docker-compose.yml exec -T postgres \\"
  echo "    psql -U hel -d postgres -c 'DROP DATABASE IF EXISTS ${STAGING_DB_NAME}; CREATE DATABASE ${STAGING_DB_NAME};'"
  echo "  docker compose -f infra/docker-compose.yml exec -T postgres \\"
  echo "    pg_restore -U hel -d ${STAGING_DB_NAME} --no-owner --no-acl /tmp/hel.dump"
  exit 1
fi

echo "Clone complete."
echo "Next:"
echo "  STAGING_DATABASE_URL='${staging_url}?schema=public' CONFIRM_STAGING_PREPARE=1 \\"
echo "    npm run staging:prepare-snapshot"
