#!/usr/bin/env bash
# Mirror local MinIO buckets (after migration:import-files) to Cloudflare R2.
# Render Nest must use the same bucket names and S3_* credentials as R2.
#
# Usage:
#   export R2_ACCOUNT_ID=...
#   export S3_ACCESS_KEY_ID=...
#   export S3_SECRET_ACCESS_KEY=...
#   ./infra/staging/mirror-minio-to-r2.sh
#
# Requires: docker (infra-minio-1) and `mc` inside the container.

set -euo pipefail

: "${R2_ACCOUNT_ID:?Set R2_ACCOUNT_ID}"
: "${S3_ACCESS_KEY_ID:?Set S3_ACCESS_KEY_ID}"
: "${S3_SECRET_ACCESS_KEY:?Set S3_SECRET_ACCESS_KEY}"

MINIO_USER="${MINIO_ROOT_USER:-helminio}"
MINIO_PASS="${MINIO_ROOT_PASSWORD:-hel_minio_dev_change_me}"
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

BUCKETS=(
  hel-profile
  hel-profile-private
  hel-chat
  hel-support
  hel-evc
)

docker exec infra-minio-1 sh -c "
  mc alias set local http://localhost:9000 '${MINIO_USER}' '${MINIO_PASS}' >/dev/null
  mc alias set r2 '${R2_ENDPOINT}' '${S3_ACCESS_KEY_ID}' '${S3_SECRET_ACCESS_KEY}' >/dev/null
"

for bucket in "${BUCKETS[@]}"; do
  echo "==> mirroring ${bucket}"
  docker exec infra-minio-1 sh -c "
    mc mirror --overwrite local/${bucket} r2/${bucket} || true
    mc ls --summarize r2/${bucket} | tail -1
  "
done

echo "Done. Set R2 CORS for https://tel-calafkaaga-1-api-one.vercel.app (GET, HEAD)."
