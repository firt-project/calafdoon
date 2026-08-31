#!/usr/bin/env bash
# PostgreSQL backup + restore validation into a temporary database.
# Does NOT touch production. Does NOT modify the canonical DB name.
#
# Usage:
#   ./scripts/staging/backup-restore-test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="$ROOT/migration-reports/phase12"
mkdir -p "$OUT_DIR"

if [[ -f "$ROOT/apps/api/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source <(grep -E '^(DATABASE_URL)=' "$ROOT/apps/api/.env" | sed 's/\r$//')
  set +a
fi

SRC_URL="${LOCAL_DATABASE_URL:-${DATABASE_URL:?DATABASE_URL required}}"
base_url="${SRC_URL%%\?*}"
admin_url="$(echo "$base_url" | sed -E 's#/[^/]+$#/postgres#')"
TMP_DB="hel_restore_test_$$"
DUMP="/tmp/${TMP_DB}.dump"
REPORT="$OUT_DIR/backup-restore.json"

started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if ! command -v pg_dump >/dev/null 2>&1; then
  cat >"$REPORT" <<EOF
{
  "generatedAt": "$started",
  "ok": false,
  "status": "BLOCKED",
  "reason": "pg_dump/psql not available on PATH; use Docker exec variant in docs/MIGRATION_PHASE_12_STAGING.md"
}
EOF
  echo "BLOCKED: pg client tools missing" >&2
  cat "$REPORT"
  exit 1
fi

pg_dump "$base_url" --format=custom --no-owner --no-acl -f "$DUMP"
checksum="$(sha256sum "$DUMP" | awk '{print $1}')"
psql "$admin_url" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${TMP_DB};"
psql "$admin_url" -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${TMP_DB};"
tmp_url="$(echo "$base_url" | sed -E "s#/[^/]+\$#/${TMP_DB}#")"
pg_restore --no-owner --no-acl -d "$tmp_url" "$DUMP"

users="$(psql "$tmp_url" -tAc 'SELECT count(*) FROM users')"
payments="$(psql "$tmp_url" -tAc 'SELECT count(*) FROM payments')"
auth="$(psql "$tmp_url" -tAc 'SELECT count(*) FROM auth_accounts')"
media="$(psql "$tmp_url" -tAc 'SELECT count(*) FROM media_objects' 2>/dev/null || echo 0)"
fk_ok="$(psql "$tmp_url" -tAc "SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_type='FOREIGN KEY'" || echo 0)"

psql "$admin_url" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${TMP_DB};"
rm -f "$DUMP"

cat >"$REPORT" <<EOF
{
  "generatedAt": "$started",
  "ok": true,
  "status": "PASS",
  "dumpChecksumSha256": "$checksum",
  "restoredTmpDatabase": "$TMP_DB",
  "droppedAfterValidation": true,
  "counts": {
    "users": $users,
    "authAccounts": $auth,
    "payments": $payments,
    "mediaObjects": $media,
    "foreignKeyConstraints": $fk_ok
  },
  "retention": "Keep daily staging dumps 14 days; weekly 8 weeks; checksum alongside dump. Never store plaintext secrets in dump sidecars."
}
EOF

echo "Wrote $REPORT"
cat "$REPORT"
