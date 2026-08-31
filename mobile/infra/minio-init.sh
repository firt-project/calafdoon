# Create MinIO buckets for Hel Calafkaaga local file migration (Phase 3).
# Buckets are private — no anonymous/public policies.
# Browser PUT/GET uses presigned URLs; MinIO API-level CORS covers that.
set -eu

endpoint="${MINIO_ENDPOINT:-http://minio:9000}"
user="${MINIO_ROOT_USER:?MINIO_ROOT_USER required}"
pass="${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD required}"

echo "Waiting for MinIO at ${endpoint}…"
i=0
until mc alias set local "${endpoint}" "${user}" "${pass}" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    echo "MinIO not ready after 60s" >&2
    exit 1
  fi
  sleep 1
done

# Presigned browser uploads from the Next.js app (bucket CORS is not
# implemented on all MinIO builds — API cors_allow_origin is the reliable path).
mc admin config set local api cors_allow_origin="*" >/dev/null 2>&1 || true

# Separate private buckets by purpose / access class
for bucket in \
  hel-profile \
  hel-profile-private \
  hel-chat \
  hel-support \
  hel-evc
do
  mc mb --ignore-existing "local/${bucket}"
  # Explicitly remove any anonymous download policy if present
  mc anonymous set none "local/${bucket}" || true
  echo "Ready: ${bucket} (private)"
done

echo "MinIO bucket initialization complete."
