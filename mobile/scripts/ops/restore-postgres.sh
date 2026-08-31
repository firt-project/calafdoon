#!/usr/bin/env bash
# Restore a custom-format pg_dump into a TARGET database URL.
# NEVER point TARGET_DATABASE_URL at production without an approved incident.
#
# Usage:
#   TARGET_DATABASE_URL=postgresql://... DUMP=./backups/postgres/hel-pg-....dump \
#     ./scripts/ops/restore-postgres.sh
set -euo pipefail

: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL is required}"
: "${DUMP:?DUMP path is required}"

if [[ ! -f "$DUMP" ]]; then
  echo "ERROR: dump not found: $DUMP" >&2
  exit 1
fi

if [[ "${I_UNDERSTAND_DESTRUCTIVE_RESTORE:-}" != "yes" ]]; then
  echo "Refusing restore. Set I_UNDERSTAND_DESTRUCTIVE_RESTORE=yes after confirming target." >&2
  exit 2
fi

if ! command -v pg_restore >/dev/null 2>&1; then
  echo "ERROR: pg_restore not found" >&2
  exit 1
fi

BASE_URL="${TARGET_DATABASE_URL%%\?*}"
echo "Restoring $DUMP → $BASE_URL"
pg_restore --clean --if-exists --no-owner --no-acl -d "$BASE_URL" "$DUMP"
echo "OK: restore finished — run API health checks next"
