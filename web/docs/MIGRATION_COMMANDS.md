# Migration commands (Phase 1 + Phase 2)

All migration commands operate only on a path you pass. They never download from Convex.

Replace `/ABS/PATH/TO/COPIED-EXPORT` with your local copy.

## Install (from repo root)

```bash
npm install
npm run prisma:generate -w @hel/api
```

If workspace install was interrupted, install package deps explicitly:

```bash
npm install -w @hel/api -w @hel/migration
```

## Local infrastructure

```bash
cp infra/.env.example infra/.env
cp apps/api/.env.example apps/api/.env
# Edit passwords in both files (keep them local-only)

cd infra
docker compose up -d postgres redis
cd ..

# Apply schema to local Postgres (development only)
npm run prisma:migrate:dev -w @hel/api -- --name phase1_init
```

## Exact dry-run inspection command

```bash
npm run migration:inspect -- --input=/ABS/PATH/TO/COPIED-EXPORT --out=/ABS/PATH/TO/reports
```

Safe sample fixture:

```bash
npm run migration:inspect -- --input="$(pwd)/packages/migration/fixtures/sample-export" --out="$(pwd)/migration-reports"
```

## Inspect password hash formats (no secrets printed)

```bash
npm run migration:inspect-auth -- --input=/ABS/PATH/TO/COPIED-EXPORT --out=/ABS/PATH/TO/reports
```

## Dry-run core conversion

```bash
npm run migration:dry-run -- --input=/ABS/PATH/TO/COPIED-EXPORT --limit=20 --out=/ABS/PATH/TO/reports
```

## Exact import of max 20 test users

Dry-run (no Postgres writes):

```bash
npm run migration:import-core -- --input=/ABS/PATH/TO/COPIED-EXPORT --limit=20 --dry-run
```

Write to local Postgres (after Docker Postgres + migrate):

```bash
set -a && source apps/api/.env && set +a
npm run migration:import-core -- --input=/ABS/PATH/TO/COPIED-EXPORT --limit=20
```

## Validate local database

```bash
set -a && source apps/api/.env && set +a
npm run migration:validate -- --out=/ABS/PATH/TO/reports
```

## Phase 2 — domain tables (after core import)

Dry-run:

```bash
npm run migration:import-domain -- \
  --input=/ABS/PATH/TO/COPIED-EXPORT \
  --dry-run \
  --out=/ABS/PATH/TO/reports
```

Import:

```bash
set -a && source apps/api/.env && set +a
npm run migration:import-domain -- \
  --input=/ABS/PATH/TO/COPIED-EXPORT \
  --out=/ABS/PATH/TO/reports
```

Validate domain tables (optional `--input` compares message counts to export):

```bash
set -a && source apps/api/.env && set +a
npm run migration:validate-domain -- \
  --input=/ABS/PATH/TO/COPIED-EXPORT \
  --out=/ABS/PATH/TO/reports
```

See `docs/MIGRATION_PHASE_2.md`.

## Phase 3 — files to local MinIO (after domain import)

Bring up MinIO + private buckets:

```bash
cd infra && docker compose up -d minio minio-init && cd ..
```

Inspect storage references:

```bash
npm run migration:inspect-storage -- \
  --input=/ABS/PATH/TO/working-export \
  --scrubbed=/ABS/PATH/TO/scrubbed-export \
  --out=/ABS/PATH/TO/reports
```

Import files:

```bash
set -a && source apps/api/.env && set +a
npm run migration:import-files -- \
  --input=/ABS/PATH/TO/working-export \
  --scrubbed=/ABS/PATH/TO/scrubbed-export \
  --out=/ABS/PATH/TO/reports
```

Validate:

```bash
npm run migration:validate-files -- \
  --input=/ABS/PATH/TO/working-export \
  --scrubbed=/ABS/PATH/TO/scrubbed-export \
  --out=/ABS/PATH/TO/reports
```

See `docs/MIGRATION_PHASE_3.md`.

## Unit tests (artificial hashes only)

```bash
npm run migration:test
# or:
npm run test -w @hel/migration
```

## API health (after Docker api or local nest)

```bash
curl -s http://127.0.0.1:4000/health
```
