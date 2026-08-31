#!/usr/bin/env bash
# Logical PostgreSQL backup for production/staging operators.
# Does NOT upload automatically — writes a local dump and checksum.
#
# Usage:
#   DATABASE_URL=postgresql://... ./scripts/ops/backup-postgres.sh
#   BACKUP_DIR=/var/backups/hel ./scripts/ops/backup-postgres.sh
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups/postgres}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/hel-pg-$STAMP.dump"

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "ERROR: pg_dump not found. Install client tools or run via docker exec." >&2
  exit 1
fi

# Strip query string for pg_dump if present
BASE_URL="${DATABASE_URL%%\?*}"

echo "Writing $OUT"
pg_dump "$BASE_URL" --format=custom --no-owner --no-acl -f "$OUT"
sha256sum "$OUT" | tee "$OUT.sha256"
echo "OK: backup complete"
