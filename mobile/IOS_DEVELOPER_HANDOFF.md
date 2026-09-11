# iOS developer handoff — HelCalaf

**Audience:** Apple / iOS developer with macOS + Xcode + Apple Developer Program.  
**This Linux machine cannot Archive or upload to App Store Connect.** Your job is to open the Xcode project, sign, TestFlight, and App Review.

---

## 1. What you are receiving

| Item | Location / value |
|------|------------------|
| App | Capacitor 7 + React (Vite) — **not** Expo / React Native |
| Native iOS project | `mobile/apps/client/ios/App/App.xcworkspace` |
| Bundle ID | `com.helcalafkaaga.helcalaf` |
| Display name | **HelCalaf** |
| Marketing version | `1.0.0` |
| Build number | `1` (bump each TestFlight upload) |
| URL scheme | `helcalaf://` |
| Backend | NestJS HTTPS API (production URL below) |
| Payments (in-app) | **WaafiPay only** (mobile wallet). No Stripe Checkout UI on mobile. |

Repo root for this product: `calafdoon/mobile/` (sibling folder `web/` is the website — not required to archive iOS).

---

## 2. Prerequisites (your Mac)

- macOS + **Xcode 16+** (recommended)
- CocoaPods (`sudo gem install cocoapods` or Homebrew)
- Node.js **20+**
- Apple Developer account + App Store Connect access for team
- Provisioning: Automatic signing with Team selected is fine for first TestFlight

---

## 3. Production API (must be HTTPS)

iOS App Transport Security is **HTTPS only** (no localhost exceptions in the committed `Info.plist`).

Before archive, confirm with the product owner:

```text
VITE_API_URL=https://api.helcalafkaaga.com
VITE_SOCKET_URL=https://api.helcalafkaaga.com
VITE_APP_URL=https://www.helcalafkaaga.com
VITE_USE_LOCAL_DEMO=false
```

Temporary / staging hosts are OK for **internal** TestFlight only if they are public HTTPS and listed in API `CORS_ORIGINS`.

API CORS must allow Capacitor WebView origins:

```text
capacitor://localhost
https://localhost
```

(plus any website origins). See `apps/api/.env.production.example`.

---

## 4. Build & open Xcode (Mac)

```bash
cd mobile
npm install

# Production web assets → native iOS folder
cp apps/client/.env.production.example apps/client/.env.production
# Edit apps/client/.env.production with the real HTTPS API URLs from §3

cd apps/client
npm run build
npx cap sync ios

cd ios/App
pod install
open App.xcworkspace
```

In Xcode:

1. Select target **App** → **Signing & Capabilities** → your Team  
2. Confirm Bundle Identifier `com.helcalafkaaga.helcalaf`  
3. Confirm Version `1.0.0` / Build `1` (increment Build for each upload)  
4. **Product → Archive**  
5. **Distribute App → App Store Connect → Upload**  
6. Enable TestFlight internal testing

One-liner from monorepo root (after `.env.production` exists):

```bash
npm run mobile:ios:sync   # macOS only — see package.json / scripts/mobile/build.sh
```

---

## 5. Capabilities already configured

In `Info.plist`:

- Camera — profile photos  
- Photo library read / add  
- Face ID unlock (optional, Settings)  
- URL scheme `helcalaf`  
- ATS: arbitrary loads **disabled** (HTTPS only)

**Do not** enable unused background modes, Push Notifications, HealthKit, or Sign in with Apple unless product asks (Sign in with Apple only if you add other social login).

---

## 6. App Store Connect checklist

| Item | Status / where |
|------|----------------|
| Privacy Policy URL | Required — use live site URL from owner |
| Support URL | Required |
| Age rating | Dating / social UGC — 17+ / 18+ per questionnaire |
| Export compliance | HTTPS / exempt — confirm in Connect |
| App Privacy labels | Draft: `store/review/APP_PRIVACY_DRAFT.md` |
| Review notes | `store/review/app-review-notes.md` |
| Demo account | Prepaid / paid-access account — never commit password |
| Account deletion | Settings → Delete account (`ACCOUNT_DELETION.md`) |
| 1024×1024 icon | `store/ios/icon/AppIcon-1024.png` (also in Assets) |
| Screenshots | Replace placeholders in `store/ios/screenshots/{en,so}/` |
| Listing copy | `store/listing-en.md`, `store/listing-so.md` |

### Billing / App Review risk (read carefully)

Mobile unlock is **WaafiPay (external mobile money)**. Apple often requires **StoreKit IAP** for digital feature unlocks.

- **Internal TestFlight:** OK with a pre-paid demo account while policy is open  
- **External TestFlight / production App Review:** product + counsel must decide IAP vs service positioning — see `STORE_POLICY_DECISIONS.md`  
- Do **not** claim App Review approval until billing approach is signed off  

---

## 7. What the iOS developer does **not** need

- Android Studio / Play Console  
- Nest API source changes (unless changing API host)  
- Stripe keys in the iOS client (Waafi-only UI; Stripe is website)  
- Local Postgres/Redis on the Mac for store builds (use hosted HTTPS API)

---

## 8. Smoke test before upload

On a physical iPhone or Simulator (HTTPS API):

1. Register / sign in  
2. Complete questionnaire if needed  
3. Plans → WaafiPay (or use pre-paid demo account if Waafi unavailable in review region)  
4. Discover → like/pass  
5. Match → send message  
6. Profile photo + crop  
7. Settings → language EN/SO  
8. Report / block  
9. Delete account on a disposable user only  

---

## 9. Contact / ownership

| Role | Responsibility |
|------|----------------|
| Product owner | API URL, demo account, Privacy/Support URLs, billing decision |
| iOS developer | Signing, Archive, TestFlight, Connect metadata, screenshots |
| Backend owner | CORS, Waafi keys, paid demo user, MFA for staff |

---

## 10. Quick identity reference

```text
Bundle ID:     com.helcalafkaaga.helcalaf
App name:      HelCalaf
Scheme:        helcalaf://
Version:       1.0.0
Build:         1+
Capacitor:     7.x
Min iOS:       as set in Xcode project (verify Deployment Target ≥ 14)
```

Questions about Android / Nest: see `MOBILE_SETUP.md`, `GOOGLE_PLAY_RELEASE.md`, `apps/api/README.md`.
