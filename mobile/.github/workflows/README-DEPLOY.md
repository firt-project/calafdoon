# Deploy pipeline — staging + gated production

Triggers on pushes to `main`, `master`, `release/**`, and `ops/**`.

Secrets live only in GitHub Environments (`staging`, `production`).  
This workflow never embeds credentials in YAML.

## Jobs

1. **quality** — typecheck/lint/unit (api) + client build gate (reuses same commands as `ci.yml`)
2. **deploy-staging** — environment `staging` — SSH remote compose pull/up OR container registry pull (operator configures secrets)
3. **staging-health** — `scripts/ops/health-smoke.sh` against `STAGING_API_BASE`
4. **deploy-production** — environment `production` (**required reviewers**) — migrate + roll
5. **production-health** — smoke against `PRODUCTION_API_BASE`

If secrets / hosts are missing, jobs fail closed with an explicit message (no fake success).

## Required GitHub Environment secrets

### staging

| Secret | Purpose |
|--------|---------|
| `STAGING_API_BASE` | `https://api.staging…` for smoke |
| `STAGING_SSH_HOST` | Optional SSH host |
| `STAGING_SSH_USER` | Optional SSH user |
| `STAGING_SSH_KEY` | Optional private key |
| `STAGING_COMPOSE_PATH` | Path to compose on host |

### production

Same pattern with `PRODUCTION_*`. Production environment must enable **Required reviewers**.

## Rollback

On failed health after deploy: previous image tag on host + see `DISASTER_RECOVERY.md`.
