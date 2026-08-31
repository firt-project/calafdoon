# Production Cutover Plan (DO NOT EXECUTE IN PHASE 12)

This is a precise plan only. **Stop before any production switch.**

## Decision owner

Assign a named rollback decision owner before the maintenance window.

---

## Before maintenance

1. Fresh Convex export **with file storage**
2. Immutable backup + SHA-256 checksums of export
3. PostgreSQL backup of migrated Nest DB + checksum
4. Verify production infra (API, Redis, private object storage, TLS, DNS)
5. Verify Stripe webhook secret staging dry-run complete; **do not** change prod webhook yet
6. Verify Resend production credentials available but **not** enabled until switch step
7. Announce maintenance window
8. Confirm rollback owner + thresholds (below)

---

## Write freeze

1. Enable maintenance / read-only mode on Convex writes
2. Prevent new Convex writes (feature flag / maintenance page)
3. Take final Convex export
4. Run idempotent delta import into Postgres
5. Migrate new files to production object storage
6. Validate all counts and relationships (users, profiles, payments, media, matches, messages)

---

## Switch order

1. Verify new production Nest `/health/ready` = 200
2. Switch Stripe webhook to Nest endpoint
3. Verify webhook with Stripe **test** event first if possible; then carefully validate live mode
4. Configure Resend production driver on Nest
5. Set `NEXT_PUBLIC_BACKEND_PROVIDER=api` (+ API/Socket URLs)
6. Deploy frontend
7. Run production smoke tests (below)
8. Reopen writes / disable maintenance

---

## Production smoke tests

- Existing user login
- Registration
- Profile edit
- Photo upload
- Discover
- Like / match
- Chat message
- Notification
- Payment checkout fulfillment
- EVC submit
- Support thread
- Admin action
- Logout

---

## Rollback thresholds (any one → rollback)

- Login failure spike (>2% sustained 5m)
- Payment fulfillment failure
- Data-count mismatch vs final export
- Missing media above agreed threshold
- Chat send/receive failure spike
- Elevated API 5xx (>1% sustained)
- Socket connect failure spike
- Authorization / admin role failures

## Rollback steps

See `docs/ROLLBACK_RUNBOOK.md`. Additionally restore original Stripe webhook if switched.

---

## Phase 12 status

Cutover **not executed**. Production remains on Convex.
