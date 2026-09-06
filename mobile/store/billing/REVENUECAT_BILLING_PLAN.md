# HelCalaf — in-app billing via RevenueCat (iOS + Android)

Generated 2026-09-06. Decisions locked with the user:
- **$4.99 one-time "Registration"** (non-consumable) **+ $0.99/month "Membership"**
  (auto-renewable subscription).
- **RevenueCat** as the billing layer.
- **Both platforms** get store billing.

Your backend **already models this price** — `mobile/apps/api/src/payments/pricing.ts`:
`REGISTRATION_AMOUNT_CENTS = 499`, `MONTHLY_AMOUNT_CENTS = 100`. That was built for
Stripe on the website. This plan adds the same thing through the app stores.

---

## 1. Why RevenueCat / store billing at all

- **Apple** (guideline 3.1.1): a membership unlocking in-app messaging between users
  is "digital content" → **must** use StoreKit. Paystack/Waafi in the iOS app = rejection.
- **Google** (Play Payments policy): same rule; Play Billing required for digital goods.
  Google does allow "user-choice billing" / alternative billing in some markets, but
  that's a separate application and 3–4% fee reduction only — not worth it now.

### What about Waafi (Somali mobile money)?

Real risk: a chunk of your users pay by **EVC/Zaad/mobile money**, not cards or a
Play/Apple balance. Recommended split:
- **iOS:** StoreKit only (via RevenueCat). No Waafi/Paystack in the iOS build.
- **Android:** Play Billing (via RevenueCat) **as the default**, and keep
  Waafi/Paystack reachable as a secondary option. This is technically against Play
  policy for digital goods; many apps serving East Africa do it anyway. Safer
  variant: Android also store-billing-only. **You decide — flagged in §6.**
- **Website:** unchanged (Stripe).

---

## 2. Product design

| Store product | Type | Price | RevenueCat |
|---|---|---|---|
| `helcalaf_registration` | Non-consumable (iOS) / one-time product (Play) | $4.99 | Offering package `registration`, grants entitlement `registered` |
| `helcalaf_membership_monthly` | Auto-renewable subscription (iOS) / subscription base plan (Play) | $0.99 / month | Offering package `$rc_monthly`, grants entitlement `membership` |

- **Entitlement `membership`** = the thing that maps to `profile.hasPaid` +
  `paidUntil`. Active subscription → access. Lapsed → back to paywall (matches
  today's `hasPaidAccess()` behaviour when `paidUntil` passes).
- **Entitlement `registered`** = the one-time $4.99 was paid. Used as a gate: the
  paywall shows "Register ($4.99)" first, then "Start membership ($0.99/mo)".
  Once `registered`, that user never pays the $4.99 again (non-consumable restores).
- Apple won't let a single subscription charge more up front, which is why this is
  two products rather than "$4.99 then $1/mo" as one SKU.
- `$1.00` isn't a standard Apple tier — use **$0.99**. (Apple has finer price points
  now; if you want exactly $1.00 you can pick it in ASC, but $0.99 converts cleaner.)

### Free / trial?
None by default. If conversion is poor, add a 3-day free trial to
`helcalaf_membership_monthly` later — that's an ASC/Play toggle + a RevenueCat
re-fetch, no code change.

---

## 3. Dashboard setup — YOU do this (I can't reach the consoles)

### 3a. App Store Connect
1. **Agreements, Tax, and Banking** → sign the **Paid Apps** agreement, add bank +
   tax info. Nothing sells until this is "Active".
2. App → **Subscriptions** → create a Subscription Group `HelCalaf Membership` →
   add subscription:
   - Reference name: `Membership Monthly`
   - Product ID: **`helcalaf_membership_monthly`**
   - Duration: 1 month, Price: **$0.99** (set for all territories)
   - Localised display name + description (EN + Somali).
3. App → **In-App Purchases** → new **Non-Consumable**:
   - Reference name: `Registration`
   - Product ID: **`helcalaf_registration`**
   - Price: **$4.99**
   - Localised name/description.
4. Add a **screenshot** for review of each product (a paywall screenshot — I'll
   generate one once the paywall UI exists).

### 3b. Google Play Console
1. **Monetisation setup** → add a payments profile (merchant account).
2. **Products → Subscriptions** → create `helcalaf_membership_monthly`, base plan
   `monthly-autorenew`, **$0.99/month**, auto-renewing.
3. **Products → In-app products** → create `helcalaf_registration`, **$4.99**.
4. **Monetisation setup → Google Play Billing** → link a **service account** so
   RevenueCat can read purchases (RevenueCat gives exact steps + the JSON).

### 3c. RevenueCat
1. Create a project `HelCalaf`.
2. **Apps**: add an App Store app (bundle `com.helcalaf.app`, needs an ASC API key —
   in-app-purchase key) and a Play app (package `com.helcalaf.app`, upload the
   service-account JSON from 3b.4).
3. **Entitlements**: create `membership` and `registered`.
4. **Products**: import `helcalaf_membership_monthly` (→ attach to `membership`)
   and `helcalaf_registration` (→ attach to `registered`).
5. **Offerings**: create the default offering `default` with:
   - package `$rc_monthly` → `helcalaf_membership_monthly`
   - package `registration` (custom) → `helcalaf_registration`
6. **API keys**: copy the **Apple** and **Google** public SDK keys (`appl_…`,
   `goog_…`) and create a **webhook**:
   - URL: `https://<your-api-host>/webhooks/revenuecat`
   - Authorization header value: a long random secret → this becomes
     `REVENUECAT_WEBHOOK_SECRET` on the API.

---

## 4. Code changes I will make (≈ client + 2 API codebases)

### Client — `mobile/apps/client`
| File | Change |
|---|---|
| `package.json` | add `@revenuecat/purchases-capacitor` |
| `src/platform/iap.ts` *(new)* | init RC with the platform key + `appUserID = <our userId>`; helpers: `getOfferings()`, `purchaseRegistration()`, `purchaseMembership()`, `restore()`, `getEntitlements()` |
| `src/features/auth/SessionProvider.tsx` | call `iap.identify(user.id)` on login, `iap.logout()` on logout |
| `src/features/payments/PlansPage.tsx` | on native: render the RC paywall (Register $4.99 → Start membership $0.99/mo), call backend `/payments/revenuecat/sync` after purchase for instant unlock, then `refresh()`. Keep Waafi/Paystack only per §6 decision. |
| `src/features/payments/PaystackCheckoutSheet.tsx` | unchanged (Android-only per §6) |
| `packages/api-client` | add `payments.revenuecatSync()` + types |

### API — `mobile/apps/api` **and** `web/apps/api` (kept in sync)
| File | Change |
|---|---|
| `src/payments/revenuecat.controller.ts` *(new)* | `POST /webhooks/revenuecat` (verify `Authorization` = `REVENUECAT_WEBHOOK_SECRET`); `POST /payments/revenuecat/sync` (authed; pulls the caller's RC subscriber via REST API v2 and applies) |
| `src/payments/revenuecat.service.ts` *(new)* | map RC event → `Payment` row + `applyPaymentCompletion`. Events: `INITIAL_PURCHASE`, `RENEWAL`, `PRODUCT_CHANGE`, `UNCANCELLATION` → grant; `EXPIRATION`, `BILLING_ISSUE` (grace) → let `paidUntil` lapse / mark; `CANCELLATION` → no-op (keeps access to period end) |
| `src/payments/grant-paid-access.service.ts` | add `"revenuecat"` to `GrantSource`; treat it as **period-locked** (`paidUntil` = RC `expiration_at`, not a fixed +30d) |
| `src/payments/pricing.ts` | export the RC product IDs + a `productToPaymentType()` |
| `src/payments/payments.module.ts` | register the new controller/service |
| `prisma/schema.prisma` + migration | `Profile.revenuecatUserId String?` (optional; RC `app_user_id` already = our userId, so may skip). `Payment` — add `"revenuecat"` to the provider/source field if it's an enum. |
| env | `REVENUECAT_WEBHOOK_SECRET`, `REVENUECAT_SECRET_API_KEY` (v2 REST, for `/sync`) |

### Key detail: `paidUntil` from RC
Today Waafi/Paystack set `paidUntil = now + 30d`. For RevenueCat we set
`paidUntil = event.expiration_at_ms` so cancellations/refunds/billing failures
correctly end access when the store says so. `applyPaymentCompletion` gets a small
change to accept an explicit `paidUntil`.

### Existing paid users
Anyone with `hasPaid = true` and a future/absent `paidUntil` keeps access — nothing
revokes them. New purchases flow through RC. Old Waafi/Paystack/EVC paths stay in
the API (Android + website). No data migration needed.

---

## 5. Test plan (before submitting)

1. ASC **Sandbox** tester + StoreKit config file → buy `helcalaf_registration`,
   then `helcalaf_membership_monthly` in the iOS sim/TestFlight; confirm entitlement
   flips, backend `Payment` row created, `hasPaid`/`paidUntil` set, paywall clears.
2. Sandbox **renewal** (5 min in sandbox) → RC `RENEWAL` webhook → `paidUntil`
   pushed out.
3. Sandbox **cancel** → access holds to period end → `EXPIRATION` → paywall returns.
4. **Restore purchases** on a fresh install → entitlements return.
5. Play **license testing** track → same matrix.
6. Refund (ASC sandbox) → `REFUND` webhook → access revoked.

---

## 6. Decision still needed from you

**Android billing:** (A) Play Billing only, cleanest for policy, but users without
a Play balance / card can't pay. (B) Play Billing default **+ keep Waafi/Paystack**
as a visible option — better for your Somali user base, against Play's letter.
→ **A or B?**

Everything else is decided. Once you answer §6 and the §3 dashboards exist (at
least RevenueCat + the product IDs), I implement §4. The dashboard work and the
Paid Apps / merchant agreements are the long pole — start those now.

---

## 7. Effort / sequencing

1. **You:** sign Paid Apps + Play merchant agreements (can take 24–48h to activate).
2. **You:** create the 2 products in ASC + Play, set up RevenueCat, send me the
   webhook secret + confirm product IDs.
3. **Me:** implement §4 (client paywall + both API webhooks) — ~1–2 focused passes.
4. **Both:** run §5 sandbox tests.
5. **You:** submit the iOS build (with the paywall screenshot for review) and the
   updated Android build.
