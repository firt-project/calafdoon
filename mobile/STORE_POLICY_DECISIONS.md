# Store policy decisions — Tel Calafkaaga

This is an **engineering + product decision list**, not legal advice.

## Paid functionality nature

The Nest backend gates Discover / matching / chat behind **server `hasPaid`** after Stripe Checkout (or EVC proof). That is typically a **digital feature unlock** inside the apps.

| Platform | Likely implication | Status |
|----------|-------------------|--------|
| Google Play | In-app digital goods often require Play Billing | **BLOCKER — Decision required** before production listing |
| Apple App Store | Digital unlocks usually require StoreKit IAP | **BLOCKER — Decision required** before App Review |
| Web | Stripe Checkout commonly acceptable | Keep Nest Stripe for web if desired |

## Options

1. **IAP-only on mobile** for digital unlock; Stripe/EVC for web
2. **Physical / offline service** positioning (if Premium is primarily human matchmaking service) — needs product + legal review; still may be scrutinized
3. **Reader app / external purchase** exceptions — Apple rules change; do not assume eligibility

## Internal testing stance (RC1)

- Google Play **internal testing** and Apple **TestFlight internal** can proceed with a prepaid demo account while the billing decision is open
- Do **not** submit production store listings until billing approach is signed off
- Keep Nest Stripe/EVC; do not unlock access from client-only success callbacks
- Fake Stripe gateway **blocked in `NODE_ENV=production`**

## Engineering follow-up if IAP required

- Add StoreKit / Play Billing purchase verification on Nest
- Map product IDs to server `hasPaid` / plan entitlements
- Keep web Stripe path separate
- Update Privacy / Terms / Data Safety for payment processors

## Owner

Product + counsel must sign off before production store submission.
