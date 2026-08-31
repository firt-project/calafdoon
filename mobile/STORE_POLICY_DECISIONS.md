# Store policy decisions — HelCalaf / Tel Calafkaaga

This is an **engineering + product decision list**, not legal advice.

## Paid functionality nature

The Nest backend gates Discover / matching / chat behind **server `hasPaidAccess`** after payment.

| Surface | Payment today | Likely store implication | Status |
|---------|---------------|--------------------------|--------|
| Website (`web/`) | Stripe (+ optional EVC) | Web Stripe usually OK | Keep |
| Mobile app | **WaafiPay only** (mobile wallet) | Apple often requires **StoreKit IAP** for digital unlocks; Play often requires Play Billing | **BLOCKER — Decision required** before production store listing |

## Options

1. **IAP-only on mobile** for digital unlock; keep Waafi/Stripe on web (or remove mobile wallet from store builds)
2. **Physical / offline service** positioning (if Premium is primarily human matchmaking) — needs product + legal review; still may be scrutinized
3. **Reader / external purchase** exceptions — Apple rules change; do not assume eligibility

## Internal testing stance (RC1 / TestFlight)

- Apple **TestFlight internal** and Play **internal testing** can proceed with a **pre-paid demo account** while the billing decision is open
- Do **not** submit production App Review / Play production until billing approach is signed off
- Never unlock access from client-only success callbacks — server `hasPaidAccess` only
- Fake Stripe gateway **blocked in `NODE_ENV=production`**

## Engineering follow-up if IAP required

- Add StoreKit / Play Billing purchase verification on Nest
- Map product IDs to server entitlements / `paidUntil`
- Keep website Stripe path separate
- Update Privacy / Terms / Data Safety for payment processors

## Owner

Product + counsel must sign off before production store submission.

