# Google Play Billing Migration Plan

**Status:** Plan only — no implementation in this document’s PR/commit scope.  
**Goal:** Replace Stripe checkout on the Android Capacitor app with Google Play Billing for two lifetime one-time products, while preserving existing Stripe (and EVC) paid users.

---

## 1. Decisions (confirmed for implementation)

| Decision | Choice |
|----------|--------|
| Platform scope | **Android only** for Play Billing. Keep Stripe on web (and iOS if still used) unless later decided otherwise. |
| Unlock model | Map Play products onto existing profile flags: `hasPaid` + `hasPersonalSupport`. Do **not** require new `lifetime_basic` / `lifetime_premium` boolean columns unless reporting needs them later. |
| Product type | One-time **non-consumable** in-app products (lifetime). |
| Existing payers | Anyone with `hasPaid` / `hasPaidAccess` / approved access must **not** be forced to pay again. |
| Package ID | Keep current app id (`com.helcalaf.app`) unless Play listing is recreated. |

---

## 2. Products (Google Play Console)

Configure in Play Console → Monetize → In-app products (one-time):

| Product ID | Name | Price (Play Console) | App unlock |
|------------|------|----------------------|------------|
| `lifetime_basic` | Lifetime Basic | $5 | `hasPaid = true` (standard lifetime access for men and women) |
| `lifetime_premium` | Lifetime Premium | $20 | `hasPaid = true` + `hasPersonalSupport = true` (all premium features for life) |

Also configure:

- License test accounts (Play Console → Setup → License testing).
- Service account with **Android Publisher API** access for server-side purchase verification.
- App must be uploaded to a testing track (Internal/Closed) before products can be purchased in real Play Billing flows.

---

## 3. Current codebase (what exists today)

### Client
- Plans UI: `apps/client/src/features/payments/PlansPage.tsx`
- Stripe mobile flow: `apps/client/src/platform/stripe-checkout.ts` (Browser checkout + session verify)
- API client: `packages/api-client/src/adapters/payments/api.ts` (`/payments/stripe/*`)

### Backend
- Stripe checkout / verify / webhooks: `apps/api/src/payments/payments.service.ts`, `stripe.gateway.ts`, `payments.controller.ts`
- Shared unlock: `apps/api/src/payments/grant-paid-access.service.ts` (`GrantSource` today: `"stripe" \| "evc"`)
- Access gates: `apps/api/src/common/access.ts`, `access-state.ts` (`hasPaid`, `hasPersonalSupport`, `isPremium`)

### Database (`Payment` model)
- Requires unique `stripeSessionId` today — **must be relaxed** for Google Play rows (nullable Stripe id + unique Play `purchaseToken`).
- Status / tier enums already support registration basic vs premium-style grants via `registrationTier` / `paymentType`.

### Mapping (Play → existing grant path)

| Play product | `registrationTier` | `paymentType` (suggested) | `GrantPaidAccessService` |
|--------------|--------------------|---------------------------|---------------------------|
| `lifetime_basic` | `basic` | `registration` | `isPremium: false` |
| `lifetime_premium` | `premium` | `registration_premium` (or upgrade if already basic) | `isPremium: true` |

Optional metadata fields for reporting (without changing unlock logic):

- `payment_provider = "google_play"`
- `purchase_type = "lifetime_basic" \| "lifetime_premium"`
- Treat `premium_active` as equivalent to `hasPersonalSupport === true` / `isPremiumMember(profile)`.

---

## 4. Target payment flow (Android)

1. User completes registration + compatibility questionnaire.
2. App shows payment screen with two options:
   - Lifetime Basic – $5 (prefer price from Play product details)
   - Lifetime Premium – $20
3. If user already has paid/approved access → skip paywall (existing Stripe/EVC/admin users).
4. User selects a product → launch Google Play Billing flow.
5. On purchase success:
   - Client obtains `productId`, `purchaseToken`, `packageName`, optional `orderId`.
   - Client sends token to backend verify endpoint.
6. Backend:
   - Verifies with Google Play Developer API.
   - Stores payment row (idempotent on `purchaseToken`).
   - Grants access via `GrantPaidAccessService`.
7. Client:
   - Acknowledges purchase (after successful backend verify — preferred).
   - Refreshes session / access state.
   - Unlocks features immediately (navigate home / clear paywall).

### Edge cases

| Case | Handling |
|------|----------|
| User cancels Play sheet | No grant; show non-blocking message |
| Pending purchase | Do not grant until state is purchased; listen / re-query |
| Already owned / restore after reinstall | `queryPurchasesAsync` → same verify endpoint → grant if DB not yet fulfilled |
| Duplicate verify | Idempotent by `purchaseToken` / `fulfillmentKey` |
| Stripe lifetime user opens Plans | No charge; show already unlocked / upgrade-only if basic→premium still allowed |
| Web client | Keep Stripe (out of scope for removal unless decided later) |

---

## 5. Client implementation plan

### 5.1 Dependencies
- Add Capacitor-compatible Google Play Billing integration wrapping **latest stable Play Billing Library** (Billing Library 7.x+), e.g.:
  - Community Capacitor plugin that uses Play Billing, **or**
  - Thin custom Capacitor plugin + BillingClient in `apps/client/android`
- Sync native project (`cap sync`) and ensure Billing permission / Play Billing dependency in Android Gradle.

### 5.2 New module (planned file)
- `apps/client/src/platform/play-billing.ts`
  - Connect / disconnect BillingClient
  - Query product details for `lifetime_basic`, `lifetime_premium`
  - Launch purchase
  - Query existing purchases (restore)
  - Acknowledge after backend success
  - Map errors: cancel, pending, unavailable, already owned

### 5.3 Plans UI
- Update `PlansPage.tsx`:
  - On Android: use Play Billing path (no Stripe Browser checkout).
  - On web (and non-Android): keep Stripe.
  - Labels: Lifetime Basic / Lifetime Premium; show Play prices when available.
  - On mount (Android): attempt restore of unacknowledged / owned products.

### 5.4 Remove Stripe from Android path only
- Stop importing / calling `openStripeCheckout` / deep-link Stripe verify on Android.
- Do **not** delete Stripe backend or web flow in the first implementation pass.
- Optional later cleanup: hide Stripe entirely from native Android builds.

### 5.5 API client
- Extend `packages/api-client/src/adapters/payments/`:
  - `verifyGooglePlayPurchase({ productId, purchaseToken, packageName, orderId? })`
  - Optional `restoreGooglePlayPurchases` if batch restore is preferred

---

## 6. Backend implementation plan

### 6.1 New endpoints
- `POST /payments/google-play/verify`
  - Auth required
  - Body: `{ productId, purchaseToken, packageName, orderId? }`
  - Response: access/grant status (same shape as Stripe verify where practical)
- Optional: `POST /payments/google-play/restore` (array of purchases)

### 6.2 Google verification gateway (planned)
- New service e.g. `apps/api/src/payments/google-play.gateway.ts`
- Use Google Android Publisher API:
  - `purchases.products.get(packageName, productId, purchaseToken)`
- Accept only valid purchased state; reject cancelled / pending / mismatched product or package.
- Acknowledge on server **or** require client acknowledge after verify (pick one; document it). Prefer: verify → grant → acknowledge (client or server).

### 6.3 Persistence
Extend `Payment` (Prisma migration):

| Field | Notes |
|-------|--------|
| `paymentProvider` | `stripe` \| `google_play` \| `evc` (or string/enum) |
| `purchaseToken` | Unique, nullable; required for Play |
| `productId` | e.g. `lifetime_basic` |
| `purchaseType` | `lifetime_basic` \| `lifetime_premium` (or derive from productId) |
| `stripeSessionId` | Make **nullable**; keep unique among non-null |
| `fulfillmentKey` | e.g. `google_play:{purchaseToken}` |
| `amount` | Store cents from known catalog or Play response if available |

Store as required by product owner:

- `payment_provider = "google_play"`
- `purchase_type = "lifetime_basic" | "lifetime_premium"`
- Effective `premium_active = true` via `hasPersonalSupport` for premium product

### 6.4 Grant path
- Extend `GrantSource` to include `"google_play"`.
- Reuse `GrantPaidAccessService.apply…` / `grantProfileAccess` so male/female approval rules stay identical to Stripe/EVC.
- Upgrade path: user with basic (`hasPaid` only) buying `lifetime_premium` → grant premium (`isUpgrade: true`).

### 6.5 Idempotency & security
- Never trust client-only “I paid” flags.
- Always verify token with Google before grant.
- Rate-limit verify endpoint (mirror Stripe verify limits).
- Bind purchase to authenticated `userId`; if token already linked to another user → reject.
- Env vars (examples):
  - `GOOGLE_PLAY_PACKAGE_NAME=com.helcalaf.app`
  - `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=...` (or path to JSON key)

---

## 7. Google Play Billing best practices (checklist)

- [ ] Use latest stable Play Billing Library via the chosen native/plugin stack.
- [ ] One-time products configured as **non-consumable** (do not call consume).
- [ ] Query product details before showing prices when online.
- [ ] Handle `USER_CANCELED`, pending, and error codes explicitly.
- [ ] Acknowledge purchases promptly after entitlement is granted.
- [ ] Restore purchases on app start / payment screen for reinstalls.
- [ ] Server-side verification with Android Publisher API.
- [ ] Idempotent fulfillment.
- [ ] Test with license testers before production rollout.
- [ ] New AAB `versionCode` when shipping billing-enabled build to Play.

---

## 8. Testing plan

### 8.1 License testers
- Add Gmail accounts in Play license testing.
- Install build from Internal/Closed track (not sideload-only for full Billing).

### 8.2 Cases to verify
1. Fresh user → buy Basic → access unlocked; DB row `google_play` + basic grant.
2. Fresh user → buy Premium → paid + personal support / premium features.
3. Cancel Play dialog → still unpaid; can retry.
4. Pending purchase → no unlock until purchased.
5. Reinstall → restore → same account unlocked without paying twice.
6. Existing Stripe paid user → not prompted to pay (or shown “already unlocked”).
7. Basic Stripe/Play user → can upgrade to Premium once.
8. Replay same `purchaseToken` → no duplicate grants / no crash.
9. Wrong package / forged token → backend rejects.

### 8.3 Regression
- Web Stripe checkout still works.
- EVC/admin grant paths unchanged.
- Access routing (`access-state`) still sends unpaid users to payment screen.

---

## 9. Suggested implementation order

1. **Play Console** — create products + service account + license testers (manual).
2. **Prisma / Payment schema** — nullable Stripe session; Play fields; migrate.
3. **Backend gateway + verify endpoint + grant** — unit/e2e tests.
4. **API client** — new verify method.
5. **Android billing module + PlansPage Android branch**.
6. **Manual QA** on Closed/Internal track with license testers.
7. **Ship** new signed AAB (bump `versionCode` / `versionName`).
8. **Optional cleanup** — remove dead Stripe UI imports from Android-only code paths; docs update.

---

## 10. Out of scope (this plan)

- Changing Android `applicationId` / package name.
- Removing Stripe from the API entirely.
- Removing EVC.
- Redesigning pricing for web.
- Adding separate `lifetime_basic` / `lifetime_premium` profile columns (unless product later requires them for analytics).

---

## 11. Risks & notes

- Play Billing **cannot** be fully tested with a random sideloaded APK; use a Play track + license testers.
- Making `stripeSessionId` nullable is a breaking schema change for any code that assumes it is always present — audit Stripe create/verify paths.
- Capacitor plugin choice affects maintenance; prefer actively maintained Billing Library 7+ support.
- Managed publishing in Play Console only publishes **approved** changes when you press Publish; unrelated to Billing API itself.

---

## 12. Success criteria

- Android users pay via Google Play only for the two lifetime products.
- Purchases verified server-side, acknowledged, and stored with `payment_provider = "google_play"`.
- Correct features unlock immediately after verify.
- Stripe customers retain access and are not charged again.
- Cancel / pending / restore behaviors handled per Google guidance.
