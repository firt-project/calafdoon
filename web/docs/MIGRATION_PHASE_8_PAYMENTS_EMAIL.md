# Hel Calafkaaga — Migration Phase 8 (Payments / EVC / Email)

## Scope

Local NestJS ports of **Stripe one-time Checkout**, **EVC/manual proofs**, **shared grantPaidAccess**, **webhook idempotency**, **reconciliation**, and **mail adapters**.

Deferred: admin dashboards, support inbox, staff invitations, announcements, site metrics UI, frontend cutover, deploy.

## Pricing (from Convex code)

| Plan | Men | Women |
|------|-----|-------|
| Basic registration | $5 (500¢) | $2.50 (250¢) |
| Premium registration | $20 (2000¢) | $15 (1500¢) |
| Premium upgrade (from Basic) | $15 (1500¢) | $15 (1500¢) |

Checkout `mode` is always **`payment`** (one-time). No subscriptions.

## Shared `grantPaidAccess`

Port of `convex/lib/grantPaidAccess.ts` + `payments.applyPaymentCompletion`:

- `hasPaid: true`, `genderLocked: true`
- Premium → `hasPersonalSupport: true`
- Premium **or** male Basic → `approved` + `reviewStatus: approved`
- Female Basic → `approved: false`, `reviewStatus: pending_review`
- Notification type `payment` + email queue
- Unlock `chatUnlocked` on all matches for registration/premium paths
- Idempotent via payment `status=completed` + unique `fulfillment_key`

## HTTP endpoints

| Method | Path |
|--------|------|
| POST | `/payments/stripe/registration-checkout` `{ tier }` |
| POST | `/payments/stripe/premium-upgrade-checkout` |
| GET | `/payments/status` |
| POST | `/payments/stripe/verify-session` `{ sessionId }` |
| POST | `/webhooks/stripe` (public, signature required) |
| POST | `/payments/evc/proof/sign-upload` |
| POST | `/payments/evc/proof/submit` |
| GET | `/payments/evc/me/latest` |
| GET | `/payments/evc/admin/pending` (admin/owner) |
| POST | `/payments/evc/admin/:proofId/approve` |
| POST | `/payments/evc/admin/:proofId/reject` |

## Webhook flow

1. Verify `stripe-signature` (fail closed)
2. Hash payload → store `stripe_webhook_events` (unique `stripe_event_id`)
3. Duplicate completed events → no-op
4. `checkout.session.completed` → fulfill (idempotent)
5. `checkout.session.expired` → mark pending payment failed
6. Failures increment `retryCount`; DLQ via BullMQ reconcile path

## EVC flow

1. Sign upload to private `hel-evc` MinIO bucket (`evc_screenshot`)
2. Submit proof (one pending per user)
3. Staff approve → create `payments` row with `stripeSessionId=evc:{proofId}` → `grantPaidAccess`
4. Staff reject → notification + email; no access grant

Production export had **0** EVC rows — local fixtures only.

## Email adapter

`MAIL_DRIVER`:

- `console` — local sink (default)
- `disabled` — no-op
- `resend` — requires `RESEND_API_KEY` (never use for production users in Phase 8 tests)

Delivery rows in `mail_deliveries` with idempotency keys. BullMQ queue `payment-email` + DLQ.

## Queues

| Queue | Purpose |
|-------|---------|
| `payment-email` | Template sends |
| `payment-email-dlq` | Dead letters |
| `payment-reconcile` | Abandoned pending cleanup (hourly) |
| `payment-reconcile-dlq` | Dead letters |

Reconcile ports Convex `reconcileAbandonedPayments` with indexed pagination (no unbounded full-table collect in the hot path).

## Security

- Auth + CSRF on browser mutations
- Webhook public but signature-verified + raw body
- Live Stripe keys blocked unless `STRIPE_ALLOW_LIVE=true` (must not set locally)
- Redis rate limits fail closed for payment mutations
- EVC screenshots: owner + staff only

## Test commands

```bash
cd apps/api
STRIPE_GATEWAY=fake npm test
STRIPE_GATEWAY=fake npm run test:e2e
npx tsx scripts/payment-parity.ts
```

## Production prerequisites (later cutover)

1. `STRIPE_SECRET_KEY=sk_live_…` only on server with `STRIPE_ALLOW_LIVE=true`
2. New webhook endpoint on Nest (do **not** change live Convex webhook until cutover)
3. `STRIPE_WEBHOOK_SECRET` for Nest endpoint
4. `MAIL_DRIVER=resend` + `RESEND_API_KEY` only when ready
5. DNS/TLS for API host
6. Dual-write or drain plan for pending checkouts

## Webhook cutover runbook (draft)

1. Deploy Nest with test webhook first; verify signatures
2. Add Nest live webhook URL in Stripe Dashboard **alongside** Convex (temporary)
3. Confirm Nest fulfills; Convex becomes no-op for already-completed sessions
4. Disable Convex webhook URL
5. Keep verify-session as fallback for success page

## Deferred

- Admin UI for EVC queue
- Frontend payment pages on Nest
- Support / announcements / metrics
- Chat unlock Stripe product (legacy `paymentType=chat`) — metadata supported, no new checkout UI
