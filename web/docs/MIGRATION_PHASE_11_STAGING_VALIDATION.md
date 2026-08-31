# Hel Calafkaaga — Migration Phase 11 (Staging Validation)

## Scope

Complete API-mode functionality, eliminate forbidden shared Convex imports, validate against **local** Nest + Postgres + Redis + MinIO. No production cutover. No Convex production contact. No live Stripe/Resend.

## Results summary

| Gate | Result |
|------|--------|
| API registration (`POST /auth/register`, `check-email`, `register/complete`) | PASS — `register/complete` aliases gender step (`ProfileService.completeRegistrationGender`); UI also uses `POST /profile/complete-registration-gender` |
| Forgot/reset API UI + `/reset-password` | PASS (Nest token flow; Convex OTP retained for provider=convex) |
| Staff invite API acceptance UI | PASS (split pages; `GET/POST /staff-invites/:token`) |
| Forbidden Convex imports (`frontend:convex-deps:check`) | **PASS — 0 forbidden / 36 allowed** |
| Webpack API shims | PASS (`src/data/shims/*` when `BACKEND_PROVIDER=api`) |
| Local load smoke (50× `/auth/me`) | PASS historically on Nest `:4001` — p50≈37ms p95≈52ms (unauthenticated 401 treated ok) |
| Socket smoke | WARNING — unauthenticated connects fail as expected; authenticated 100-conn path requires live Nest + seed login |
| Playwright 20 scenarios | Suite **implemented** in `e2e/staging/smoke.spec.ts`. Last live UI run was partial (Next still Convex redirects). **Re-run blocked in this environment: Docker daemon / Postgres / Redis / MinIO / Nest / Next are all down.** |
| Cloud staging HTTPS deploy | **NOT EXECUTED** — exact commands below; stopped before any ambiguous external action |
| Media restore to separate staging bucket | NOT EXECUTED (local MinIO already holds Phase 3 media; no separate staging R2) |

## Auth policy (staging)

**Allowlisted test accounts only** (do not email real production users):

| Email | Role | Password (local/dev only) |
|-------|------|---------------------------|
| `staging.e2e.member@hel.local` | member | `StagingMember1!` |
| `staging.e2e.admin@hel.local` | admin | `StagingAdmin1!` |
| `staging.e2e.unpaid@hel.local` | unpaid member | `StagingUnpaid1!` |

Seed: `npm run staging:seed-users`

If staging is reachable beyond the core team, run `scripts/staging/anonymize-optional.sql` (expand before use) and rotate allowlist passwords.

## Local staging counts (last validated snapshot)

From `migration-reports/phase11/staging-counts.json` (2026-07-12):

| Table / metric | Count |
|----------------|------:|
| users | 739 |
| authAccounts | 713 |
| profiles | 706 |
| payments | 100 |
| matches | 19 |
| notifications | 11140 |
| staffInvites | 4 |
| auditLogs | 450 |
| evcPaymentProofs | 6 |
| staging E2E users | 3 |

Canonical local migrated copy was **not** modified by staging anonymization.

## Local staging commands

```bash
# 1) Data plane
docker compose -f infra/docker-compose.yml up -d postgres redis minio minio-init

# 2) Nest (prefer free port if :4000 holds a stale Phase-1 process)
cd apps/api && PORT=4001 STRIPE_GATEWAY=fake MAIL_DRIVER=console \
  COOKIE_SECURE=false CORS_ORIGINS='http://127.0.0.1:3000,http://localhost:3000' \
  npx nest start

# 3) Next in API mode
NEXT_PUBLIC_BACKEND_PROVIDER=api \
NEXT_PUBLIC_API_URL=http://127.0.0.1:4001 \
NEXT_PUBLIC_SOCKET_URL=http://127.0.0.1:4001 \
npm run dev -- -p 3000

# 4) Seed + validate
npm run staging:seed-users
npm run staging:validate-counts
STAGING_API_URL=http://127.0.0.1:4001 STAGING_EMAIL=staging.e2e.member@hel.local \
  STAGING_PASSWORD='StagingMember1!' npm run staging:load-smoke
npm run frontend:convex-deps:check

# 5) Full Playwright (20 scenarios)
STAGING_E2E=1 STAGING_BASE_URL=http://127.0.0.1:3000 \
STAGING_API_URL=http://127.0.0.1:4001 \
NEXT_PUBLIC_BACKEND_PROVIDER=api \
npm run test:e2e:staging
```

**Note:** A stale Phase-1 process on `:4000` returns 404 for `/auth/*`. Point env at the current Nest build (e.g. `:4001`).

## Cloud private staging — exact commands (STOP before secrets / DNS)

Do **not** run these against production. Fill placeholders only after staging DNS, TLS, and secret vaults exist.

```bash
# A. Provision (operator): staging Postgres, Redis, private S3, TLS certs, staging DNS
#    staging.example.com → Next
#    api.staging.example.com → Nest

# B. Nest image
docker build -f apps/api/Dockerfile -t hel-api:staging .

# C. Migrate staging DB only
export DATABASE_URL='postgres://USER:PASS@STAGING_PG_HOST:5432/hel_staging'
cd apps/api && npx prisma migrate deploy

# D. Seed from local verified dump (never overwrite production)
./scripts/staging/seed-from-local.sh
# Follow printed pg_dump | strip fixtures | restore steps.
# Before restore: psql … -f scripts/staging/prepare-fixture-clean.sql on the DUMP side.

# E. Run Nest with staging-only env (examples — do not copy production secrets)
export NODE_ENV=production
export PORT=4000
export COOKIE_SECURE=true
export COOKIE_DOMAIN='.staging.example.com'   # staging only
export CORS_ORIGINS='https://staging.example.com'
export STRIPE_GATEWAY=fake                    # or Stripe TEST keys
export MAIL_DRIVER=console                    # or approved test Resend
export REDIS_URL='redis://STAGING_REDIS:6379'
export S3_ENDPOINT='https://STAGING_S3'
# … staging S3 keys/buckets only …

docker run --env-file apps/api/.env.staging -p 4000:4000 hel-api:staging

# F. Next (API mode) — staging host only
export NEXT_PUBLIC_BACKEND_PROVIDER=api
export NEXT_PUBLIC_API_URL=https://api.staging.example.com
export NEXT_PUBLIC_SOCKET_URL=https://api.staging.example.com
export NEXT_PUBLIC_APP_URL=https://staging.example.com
# Do not set production analytics / production cookie domain
npm run build && npm run start

# G. Smoke
curl -fsS https://api.staging.example.com/health
STAGING_E2E=1 STAGING_BASE_URL=https://staging.example.com \
  STAGING_API_URL=https://api.staging.example.com npm run test:e2e:staging
```

**STOP:** This environment has no Docker daemon and no staging cloud credentials. Do not invent production/staging account IDs or push images without explicit operator approval.

## Security staging review (local/policy)

| Control | Status |
|---------|--------|
| HTTPS | WARNING — local HTTP; cloud TLS required |
| Secure cookies | WARNING locally (`COOKIE_SECURE=false`); PASS when staging sets true |
| CSRF | PASS — Nest `CsrfGuard` |
| CORS | PASS — `CORS_ORIGINS` |
| CSP / Helmet (Next headers) | PASS — `next.config.ts` |
| Private object buckets | PASS — MinIO private; signed URLs |
| No production secrets | PASS — policy + separate env |
| No PII in mail to real users | PASS — allowlist + console mail |
| No Convex prod from API frontend | PASS — shims + forbidden=0 |
| No live Stripe / Resend | PASS — fake/console |
| Admin role guards | PASS |
| Redis rate limits | PASS — fail-closed auth/admin |

## Rollback

```bash
NEXT_PUBLIC_BACKEND_PROVIDER=convex
# rebuild + redeploy frontend only — no DB rollback
```

API-mode webpack stubs are inactive when provider=convex.

## Do not

- Flip production to `api`
- Contact Convex production
- Use live Stripe/Resend
- Use production object storage or cookie domain
- Change the production Stripe webhook
