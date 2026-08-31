# Staging Deployment Runbook

Commands only — do **not** run against production. Do not flip live Stripe/webhooks.
Do not use production database, Redis, object storage, Stripe secret, Resend secret, or cookie domain.

See also: `docs/MIGRATION_PHASE_11_STAGING_VALIDATION.md`.

## Prerequisites

- Private staging DNS (frontend + API), TLS certificates
- Staging Postgres, Redis, private S3-compatible storage
- Nest API + Next.js builds
- Stripe **test** keys or `STRIPE_GATEWAY=fake`
- `MAIL_DRIVER=console` or an approved **test** Resend account
- Explicit frontend env:

```bash
NEXT_PUBLIC_BACKEND_PROVIDER=api
NEXT_PUBLIC_API_URL=https://api.staging.example.com
NEXT_PUBLIC_SOCKET_URL=https://api.staging.example.com
NEXT_PUBLIC_APP_URL=https://staging.example.com
```

Current Vercel preview frontend (API mode):

```bash
# See also: infra/staging/vercel-api-mode.env.example
NEXT_PUBLIC_BACKEND_PROVIDER=api
NEXT_PUBLIC_APP_URL=https://tel-calafkaaga-1-api-one.vercel.app
NEXT_PUBLIC_API_URL=https://YOUR-NEST-API.example.com
NEXT_PUBLIC_SOCKET_URL=https://YOUR-NEST-API.example.com
# Nest CORS_ORIGINS must explicitly include that preview URL if it should call the API (L5).
```

Convex URL is **not** required for API-mode auth.

## STOP — environment gate

If Docker, cloud credentials, or staging DNS are missing (as in the Phase 11 agent environment):

1. Print the commands below.
2. **Do not** invent account IDs, push images, or touch production.
3. Hand off to an operator with staging vault access.

## Deploy Nest API

```bash
# Build image (example)
docker build -f apps/api/Dockerfile -t hel-api:staging .

# Migrate staging DB only
export DATABASE_URL=postgres://USER:PASS@STAGING_PG:5432/hel_staging
cd apps/api && npx prisma migrate deploy && npx prisma generate

# Local data-plane example (not cloud):
docker compose -f infra/docker-compose.yml \
  -f infra/staging/docker-compose.staging.yml up -d postgres redis minio minio-init

# Nest env (staging-only)
# COOKIE_SECURE=true
# COOKIE_DOMAIN=.staging.example.com
# CORS_ORIGINS=https://staging.example.com
# STRIPE_GATEWAY=fake
# MAIL_DRIVER=console
```

## Seed from local (see also `scripts/staging/seed-from-local.sh`)

```bash
./scripts/staging/seed-from-local.sh
# Follow printed pg_dump / restore steps; strip local_* fixtures first:
#   psql … -f scripts/staging/prepare-fixture-clean.sql
# Preserve imported Convex IDs / production-copy relationships unless anonymizing.
```

Optional anonymization stub (expand before external staging access):

```bash
psql "$STAGING_DATABASE_URL" -f scripts/staging/anonymize-optional.sql
```

Auth policy: **allowlisted test accounts only** (`npm run staging:seed-users`). Never email real production users.

## Deploy Next (API mode)

```bash
# Host env must set provider=api explicitly (never infer from API_URL)
NEXT_PUBLIC_BACKEND_PROVIDER=api
NEXT_PUBLIC_API_URL=https://api.staging.example.com
NEXT_PUBLIC_SOCKET_URL=https://api.staging.example.com
NEXT_PUBLIC_APP_URL=https://staging.example.com
# Do not set production analytics / production cookie domain
npm run build && npm run start
```

## Smoke checklist

1. `GET /health` on API
2. Login allowlisted user → cookie `hel_session` + `hel_csrf`
3. `GET /auth/me` returns user + accessState
4. Profile / matches / notifications load via REST
5. Chat: Socket.IO connect with credentials; join conversation; send message
6. Checkout: Stripe test / fake only — never prod keys on staging
7. Admin: approve/ban on staging fixtures only
8. `npm run frontend:convex-deps:check` → forbidden=0
9. `STAGING_E2E=1` Playwright 20 scenarios

## Rollback

Set frontend env back to:

```bash
NEXT_PUBLIC_BACKEND_PROVIDER=convex
NEXT_PUBLIC_CONVEX_URL=https://...
```

Redeploy Next. Nest staging can stay up. No Convex disable required. No database rollback.

## E2E

```bash
STAGING_E2E=1 \
STAGING_BASE_URL=https://staging.example.com \
STAGING_API_URL=https://api.staging.example.com \
NEXT_PUBLIC_BACKEND_PROVIDER=api \
npm run test:e2e:staging
```
