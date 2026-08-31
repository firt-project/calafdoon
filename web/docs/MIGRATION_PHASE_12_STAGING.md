# Migration Phase 12 — Staging Validation & Release Readiness

## Scope

Complete local API-mode stack reliability, staging data policy, dual-read shadow layer,
observability, backup/restore tooling, Playwright/load readiness, and cutover **plans**.

**Do not switch production. Do not change the production Stripe webhook. Do not enable production Resend.**

## One-command local stack

```bash
npm run stack:local:api
# or: ./scripts/staging/start-local-api-stack.sh
```

Starts/assumes: Postgres, Redis, MinIO (+ bucket init), Nest (`:4001` by default), Next with `NEXT_PUBLIC_BACKEND_PROVIDER=api`.

Does **not** reset the database.

Health checks:

```bash
curl -s http://127.0.0.1:4001/health
curl -s http://127.0.0.1:4001/health/ready
curl -s http://127.0.0.1:4001/health/live
```

## Staging DB snapshot (non-canonical)

```bash
./scripts/staging/clone-local-to-staging-db.sh
STAGING_DATABASE_URL='postgresql://hel:…@127.0.0.1:5432/hel_staging_phase12?schema=public' \
  CONFIRM_STAGING_PREPARE=1 \
  npm run staging:prepare-snapshot
```

Policy: allowlisted staging aliases only; other password hashes replaced with discarded Argon2id material; `mustResetPassword=true` for others. Convex/relational IDs preserved.

## Shadow reads

See `docs/SHADOW_READS.md`. Default **off**. Never enable in production during Phase 12.

## Cloud staging

Template: `infra/staging/docker-compose.cloud.yml` + `Caddyfile` + `.env.staging.example`.

If Docker group / cloud credentials / DNS / TLS are unavailable: **mark cloud execution BLOCKED** and stop. Do not invent results.

## Validation commands

```bash
npm run phase12:validate
STAGING_E2E=1 STAGING_API_URL=http://127.0.0.1:4001 \
  STAGING_BASE_URL=http://127.0.0.1:3000 \
  NEXT_PUBLIC_BACKEND_PROVIDER=api \
  npm run test:e2e:staging
npm run staging:backup-restore-test
npm run staging:validate-media
```

## Artifacts

`migration-reports/phase12/*`

## Related docs

- `docs/PRODUCTION_CUTOVER_PLAN.md` (do not execute)
- `docs/ROLLBACK_RUNBOOK.md`
- `docs/SHADOW_READS.md`
