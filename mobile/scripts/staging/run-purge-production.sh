#!/usr/bin/env bash
# Purge @hel.local / synthetic test users from the Render Postgres used in production.
# Reads DATABASE_URL from TEL-CALAFKAAGA-1.env (repo root) — never pass passwords on the CLI.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/TEL-CALAFKAAGA-1.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — set ENV_FILE or create TEL-CALAFKAAGA-1.env with DATABASE_URL." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL not set in $ENV_FILE" >&2
  exit 1
fi

# Render internal hostnames need the external suffix + SSL.
if [[ "$DATABASE_URL" =~ @dpg-([^/.]+)(/|\?) ]] && [[ "${BASH_REMATCH[1]}" != *render.com* ]]; then
  DATABASE_URL="${DATABASE_URL/@dpg-${BASH_REMATCH[1]}/@dpg-${BASH_REMATCH[1]}.oregon-postgres.render.com}"
fi
if [[ "$DATABASE_URL" != *sslmode=* ]]; then
  if [[ "$DATABASE_URL" == *"?"* ]]; then
    DATABASE_URL="${DATABASE_URL}&sslmode=require"
  else
    DATABASE_URL="${DATABASE_URL}?sslmode=require"
  fi
fi
export DATABASE_URL

cd "$ROOT"
echo "=== Dry run ==="
npm run staging:purge-synthetic

if [[ "${1:-}" == "--execute" ]]; then
  if [[ "${CONFIRM_PURGE_SYNTHETIC:-}" != "1" ]]; then
    echo "Set CONFIRM_PURGE_SYNTHETIC=1 to delete synthetic users." >&2
    exit 1
  fi
  echo "=== Execute purge ==="
  npm run staging:purge-synthetic -- --execute
fi
