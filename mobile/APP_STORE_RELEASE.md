# Apple App Store release — HelCalaf

**Requires macOS + Xcode + Apple Developer Program. Linux cannot archive iOS.**

Primary handoff for the iOS developer: **[IOS_DEVELOPER_HANDOFF.md](./IOS_DEVELOPER_HANDOFF.md)**  
Checklist: **[store/ios/HANDOFF_CHECKLIST.md](./store/ios/HANDOFF_CHECKLIST.md)**

Engineering guide — not legal advice. Does not claim App Review approval.

## Identity

| Field | Value |
|-------|--------|
| Bundle ID | `com.helcalaf.app` |
| Display name | HelCalaf |
| Marketing version | `1.0.0` |
| Build (`CURRENT_PROJECT_VERSION`) | `1` — increment each TestFlight upload |
| URL scheme | `helcalaf://` |
| Stack | Capacitor 7 + React (Vite) |

## Process (macOS)

```bash
cd mobile
npm install
cp apps/client/.env.production.example apps/client/.env.production
# Set VITE_API_URL / VITE_SOCKET_URL to public HTTPS (required)

cd apps/client
npm run build
npx cap sync ios
cd ios/App && pod install
open App.xcworkspace
# Signing & Capabilities → Team
# Product → Archive → Validate → Distribute → TestFlight
```

## Capabilities & privacy strings

Configured in `Info.plist`:

- Camera
- Photo library read / add
- Face ID (`NSFaceIDUsageDescription`)
- URL scheme `helcalaf`
- ATS: HTTPS only (`NSAllowsArbitraryLoads` = false)

Do **not** enable unused background modes, Push (until implemented), HealthKit, or unrestricted ATS.

## Payments (mobile)

- In-app checkout is **WaafiPay only** (no Stripe UI on mobile).
- Apple may still require StoreKit IAP for digital unlocks — see `STORE_POLICY_DECISIONS.md` (**blocker** for production App Review).
- Internal TestFlight can use a **pre-paid demo account**.

## App Store Connect

- Privacy Policy URL + Support URL
- Age rating (adult dating / social UGC)
- Export compliance (HTTPS — confirm exemption)
- App Privacy labels — `store/review/APP_PRIVACY_DRAFT.md`
- Review notes — `store/review/app-review-notes.md`
- Account deletion — `ACCOUNT_DELETION.md`
- Handoff checklist — `store/ios/HANDOFF_CHECKLIST.md`

## Assets

| Asset | Location |
|-------|----------|
| 1024×1024 icon (no transparency) | `store/ios/icon/AppIcon-1024.png` |
| Screenshots | Replace placeholders in `store/ios/screenshots/{en,so}/` |
| Listing copy | `store/listing-en.md`, `store/listing-so.md` |

## TestFlight

Internal testing is the first target. External TestFlight / App Review needs billing policy clarity and real screenshots.
