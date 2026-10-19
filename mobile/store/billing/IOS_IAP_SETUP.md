# iOS In-App Purchase — setup checklist (you do this; I cannot reach the consoles)

Code is done: one auto-renewing subscription, `helcalaf_membership_monthly`
(price = what you set in ASC; the app shows Apple's price). Access = RevenueCat
entitlement `membership`; server stores `paidUntil` = store expiry.

1. **App Store Connect → Business/Agreements**: sign **Paid Apps** agreement + bank + tax.
2. **App → Subscriptions**: create group `HelCalaf Membership`, product ID
   `helcalaf_membership_monthly`, 1 month, price (suggest $4.99 = same as today),
   localized name/description (EN + Somali), review screenshot of the paywall.
   Status must be *Ready to Submit*; submit it **with the app version**.
3. **RevenueCat** (revenuecat.com): project → add iOS app (bundle
   `com.helcalafkaaga.helcalafkaaga`, upload ASC **In-App Purchase key**) →
   Entitlement `membership` → import product → Offering `default` with the
   monthly package → copy **Apple public SDK key** (`appl_…`) and **Secret API key** (`sk_…`).
4. **RevenueCat → Integrations → Webhooks**: URL
   `https://tel-calafkaaga-1.onrender.com/webhooks/revenuecat`, Authorization header =
   a long random secret.
5. **Render env**: `REVENUECAT_SECRET_API_KEY=sk_…`, `REVENUECAT_WEBHOOK_SECRET=<same secret>`.
6. **codemagic.yaml** `VITE_REVENUECAT_IOS_KEY: "appl_…"` (public key) — then new Codemagic build.
7. **Sandbox**: create a Sandbox tester in ASC; test on TestFlight: subscribe, restore, expiry.
8. Add an *unpaid* demo account to the review notes so Apple can see the purchase sheet.
