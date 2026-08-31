# Rollback Runbook (Frontend provider)

Production remains on Convex until an explicit cutover. This runbook rolls **back**
from a failed API-mode deploy to Convex without deleting Nest data.

## Preconditions

- Convex production deployment healthy
- Frontend build still includes Convex packages and `provider=convex` path
- Nest/Postgres may stay online (read-only optional)

## Steps

1. Set frontend env:

```bash
NEXT_PUBLIC_BACKEND_PROVIDER=convex
NEXT_PUBLIC_CONVEX_URL=<production-convex-url>
# Leave NEXT_PUBLIC_API_URL unset or unused
NEXT_PUBLIC_SHADOW_READS_ENABLED=false
```

2. Rebuild frontend (`npm run build`).
3. Redeploy frontend only.
4. Keep Nest API / Postgres / Redis / object storage **untouched** (preserve for forensics).
5. Smoke: login, discover, chat, payment status page, admin denial for member.
6. If Stripe webhook was switched during cutover: restore original Convex webhook endpoint (operator action — not done in Phase 12).
7. Disable new API writes at the edge if applicable (maintenance / firewall).

## Validation

- Convex login works
- Critical pages load without Nest
- No requirement to roll back Postgres

## Do not

- Remove Convex packages
- Drop Nest databases
- Delete audit logs
- Flip provider without decision owner approval
