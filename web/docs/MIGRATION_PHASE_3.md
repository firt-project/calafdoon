# Hel Calafkaaga — Migration Phase 3 (files → local MinIO)

## Purpose

Migrate Convex `_storage` blobs from a **local export copy** into **local MinIO** (S3-compatible), and record metadata in PostgreSQL `media_objects`.

It does **not**:

- Connect to Cloudflare R2 production
- Contact Convex production
- Modify frontend or deploy
- Delete or alter the original ZIP / working export
- Create public bucket policies

## Local MinIO

```bash
# Ensure infra/.env has MINIO_ROOT_* (see infra/.env.example)
cd infra
docker compose up -d minio minio-init
cd ..
```

Buckets (all private):

| Bucket | Purpose |
|--------|---------|
| `hel-profile` | main / additional / unknown |
| `hel-profile-private` | private profile photos |
| `hel-chat` | chat images |
| `hel-support` | support attachments |
| `hel-evc` | EVC payment screenshots |

API: `127.0.0.1:9000` · Console: `127.0.0.1:9001`

## Schema

```bash
export DATABASE_URL=postgresql://hel:…@127.0.0.1:5432/hel_calafkaaga?schema=public
npm run prisma:generate -w @hel/api
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
```

## Commands

```bash
# 1) Storage reference report
npm run migration:inspect-storage -- \
  --input="$(pwd)/backups/convex/working-export" \
  --scrubbed="$(pwd)/backups/convex/scrubbed-export" \
  --out="$(pwd)/migration-reports/phase3"

# 2) Dry-run file migration
set -a && source apps/api/.env && set +a
npm run migration:import-files -- \
  --input="$(pwd)/backups/convex/working-export" \
  --scrubbed="$(pwd)/backups/convex/scrubbed-export" \
  --dry-run \
  --out="$(pwd)/migration-reports/phase3"

# 3) Upload + DB metadata
npm run migration:import-files -- \
  --input="$(pwd)/backups/convex/working-export" \
  --scrubbed="$(pwd)/backups/convex/scrubbed-export" \
  --out="$(pwd)/migration-reports/phase3"

# 4) Validate
npm run migration:validate-files -- \
  --input="$(pwd)/backups/convex/working-export" \
  --scrubbed="$(pwd)/backups/convex/scrubbed-export" \
  --out="$(pwd)/migration-reports/phase3"
```

Object key formula: `{convexStorageId}.{ext}` inside the purpose bucket.

Access: `MediaAccessService` issues short-lived signed GET URLs only (see `apps/api/src/media/`).
