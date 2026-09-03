# Paystack integration

Paystack is the fourth payment gateway on Web, alongside **Stripe**
(card subscription), **WaafiPay** (mobile wallet), and **EVC** (manual proof).
It gives members a hosted card / bank-transfer / mobile-money checkout.

Code lives in `apps/api/src/payments/`:

| File | Role |
| --- | --- |
| `paystack.client.ts` | HTTP client — initialize / verify transaction, webhook signature check |
| `paystack-payments.service.ts` | Business logic — start checkout, verify, webhook fulfilment |
| `paystack.client.test.ts` | Unit tests (config + webhook signature) |

Frontend: `src/components/payment/paystack-payment-section.tsx`, wired into
`payment-gate.tsx` as the **"Paystack M-Pesa"** option (one of four tabs:
Stripe card / WaafiPay / Paystack M-Pesa / manual payment). The section sends
`channel: "mobile_money"` so the hosted checkout opens straight to an M-Pesa
STK push. The tab is always shown; when `/payments/paystack/status` returns
`enabled: false` it renders an "temporarily unavailable" notice instead of the
pay button (`payment.gatewayUnavailable`).

---

## Pricing — `$4.99` first, then `$1` / month

Paystack follows the **same curve as Stripe and WaafiPay**:

| Tier | First payment | Every 30-day renewal |
| --- | --- | --- |
| Basic (men & women) | `$4.99` | `$1.00` |
| Personal support (men premium) | `$20.00` | `$20.00` (full price) |
| Women premium | `$15.00` | `$15.00` (full price) |

The amount is computed by `periodicRegistrationChargeCents()` in
`pricing.ts`. A member is "renewing" when `profile.hasPaid === true`
(`isMembershipRenewal()`).

Access is **period-locked**: a successful payment sets `profile.paidUntil =
now + 30 days` (`MEMBERSHIP_PERIOD_DAYS`). When it lapses, the member pays again
— the next charge is `$1.00` for Basic. Paystack currently has **no silent
auto-charge**; renewal is member-initiated, exactly like WaafiPay. (A saved
`authorization_code` is captured on `verify` for a future scheduled-charge job.)

---

## Environment variables

Set on the **API host (Render)** — never Vercel, never committed.

| Var | Example | Notes |
| --- | --- | --- |
| `PAYSTACK_SECRET_KEY` | `sk_live_…` | `sk_test_…` in staging. Also used to verify webhook signatures. |
| `PAYSTACK_PUBLIC_KEY` | `pk_live_…` | Returned by `/payments/paystack/status` for the browser. |
| `PAYSTACK_CURRENCY` | `USD` | **Must match your Paystack account's settlement currency.** Default `USD`. |
| `PAYSTACK_USD_RATE` | `130` | Units of `PAYSTACK_CURRENCY` per 1 USD. **Required when `PAYSTACK_CURRENCY` ≠ USD** — the client throws rather than charge the wrong amount. |

`mode()` is derived from the key prefix (`sk_live_` → live, `sk_test_` → test).
`/payments/paystack/status` reports `enabled`, `mode`, and `currency`. The
**Paystack M-Pesa** tab is always visible; with no key set it shows an
"unavailable" notice and members use card / WaafiPay / the manual proof flow.

> **Currency:** `Payment.amount` is always stored in **USD cents** (canonical —
> keeps admin revenue reporting in one currency). When `PAYSTACK_CURRENCY` is
> USD, that integer is sent to Paystack unchanged. Otherwise
> `PaystackClient.chargeAmount()` converts it with `PAYSTACK_USD_RATE`
> (e.g. `$4.99 → 499 → 499 × 130 = 64 870` KES subunit). `verify` / webhook
> re-derive the same expected charge and reject an underpayment or a currency
> mismatch. Update `PAYSTACK_USD_RATE` when the FX rate drifts.
>
> This is what mobile M-Pesa uses: `PAYSTACK_CURRENCY=KES` + `PAYSTACK_USD_RATE`.

---

## API endpoints

All under the payments controller (`apps/api/src/payments/payments.controller.ts`).

| Method & path | Auth | Purpose |
| --- | --- | --- |
| `POST /payments/paystack/registration-checkout` | session + CSRF + rate limit | Body `{ tier?: "basic" \| "premium", channel?: "mobile_money" \| "card" \| "bank" }`. Creates a pending `Payment`, calls Paystack `initialize`, returns `{ authorizationUrl, reference, amountCents, tier, isRenewal }`. The **Paystack M-Pesa** tab sends `channel: "mobile_money"`, which restricts the hosted checkout to Paystack's `channels: ["mobile_money"]`. |
| `POST /payments/paystack/verify` | session + CSRF + rate limit | Body `{ reference }`. Verifies with Paystack and grants access. Called by the success page. |
| `GET /payments/paystack/status` | public | `{ enabled, configured, mode, currency, publicKey }`. |
| `POST /webhooks/paystack` | public (HMAC-verified) | Paystack `charge.success` events — backstop fulfilment. |

### Checkout flow

```
member clicks "Pay with Paystack"
        │
        ▼
POST /payments/paystack/registration-checkout
        │  creates Payment(status=pending, stripeSessionId="paystack:<ref>")
        │  Paystack /transaction/initialize
        ▼
redirect → result.authorizationUrl  (Paystack hosted page)
        │
   member pays
        │
        ├──────────────► Paystack redirects back to
        │                /payment/success?paystack_reference=<ref>
        │                        │
        │                        ▼  POST /payments/paystack/verify
        │                        grant.applyPaymentCompletion(source:"paystack")
        │
        └──────────────► POST /webhooks/paystack  (charge.success)
                                 │  signature check (HMAC-SHA512, secret key)
                                 ▼  same fulfilment — idempotent
```

Both paths call `fulfillByReference()`, which:

1. re-verifies the transaction with Paystack (`/transaction/verify/:ref`),
2. rejects underpayments (`verified.amount < payment.amount`),
3. calls `grant.applyPaymentCompletion({ source: "paystack", … })`.

Fulfilment is **idempotent**: the grant path is a no-op once
`Payment.status === "completed"`, and `Payment.fulfillmentKey =
"paystack:<ref>"` is unique. The webhook additionally claims a row in
`stripe_webhook_events` (`stripeEventId = "paystack:<event id>"`) to dedupe
retries.

---

## Webhook setup

1. Paystack Dashboard → **Settings → API Keys & Webhooks**.
2. Set the **Webhook URL** to `{API origin}/webhooks/paystack`
   (e.g. `https://api.web.example.com/webhooks/paystack`).
3. Paystack signs the raw body with `HMAC-SHA512` keyed by your **secret key**
   and sends it as `x-paystack-signature`. `verifyWebhookSignature()` checks it
   with a timing-safe compare; unsigned or mismatched requests get `400`.
4. Only `charge.success` is actioned; other signed events return
   `{ received: true, ignored: true }` so Paystack stops retrying.

---

## Data model

No schema migration. Paystack reuses existing tables with a `paystack:` prefix,
matching the WaafiPay/EVC convention:

| Column | Value |
| --- | --- |
| `Payment.stripeSessionId` | `paystack:<reference>` |
| `Payment.fulfillmentKey` | `paystack:<reference>` |
| `StripeWebhookEvent.stripeEventId` | `paystack:<event id or reference>` |

`inferPaymentGateway()` / `gatewayWhere()` in `payment-gateway.ts` recognise the
prefix, so the admin payments dashboard reports Paystack revenue in its own
column and the `?gateway=paystack` filter works.

---

## Testing

- **Unit:** `npm --prefix apps/api test` runs `paystack.client.test.ts`
  (config detection + webhook signature).
- **Sandbox:** use `sk_test_…` / `pk_test_…` keys and Paystack
  [test cards](https://paystack.com/docs/payments/test-payments) (e.g. success
  card `4084 0840 8408 4081`, any future expiry, any CVV, OTP `123456`).
- **Local webhook:** `paystack listen` (Paystack CLI) or expose
  `POST /webhooks/paystack` via a tunnel and register the tunnel URL.

---

## Not included (future work)

- **Silent monthly auto-charge.** The `authorization_code` from `verify` is
  returned by the client but not yet persisted or charged. To auto-renew,
  store it on the member and add a scheduled job that calls
  `/transaction/charge_authorization` for `$1.00` before `paidUntil`.
- **Live FX** — `PAYSTACK_USD_RATE` is a static env value; there is no rate feed.
- **Refund / dispute handling** via `charge.dispute.*` webhook events.
