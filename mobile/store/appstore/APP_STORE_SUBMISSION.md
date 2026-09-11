# HelCalaf — Apple App Store submission pack

Generated 2026-09-06. Companion to the Play pack in `mobile/store/play/`.

Apple Developer: **Individual**, Team ID **`PHULDKCSY6`**, renews 2027-09-07.
Bundle ID: **`com.helcalafkaaga.helcalaf`** (App Store Connect app record, Apple ID
6811169065). This intentionally differs from the Android `applicationId`
(`com.helcalaf.app`), which is already live on Play and stays unchanged.

---

## 0. The one hard blocker: you need a Mac (or a cloud Mac)

iOS apps **cannot be built, signed, or uploaded from Linux** — this machine can't
do it. Two ways forward:

| Option | Effort | Cost |
|---|---|---|
| **Codemagic** (cloud macOS CI) — recommended | ~30 min one-time setup, then push-button | Free tier ≈ 500 build-min/mo; iOS builds ~15–20 min each |
| Your own Mac + Xcode 15+ | Install Xcode, open project, Archive → Distribute | free if you have a Mac |

I've prepared **`codemagic.yaml`** (repo root) so Codemagic does the whole
build → TestFlight pipeline. Setup steps in §5.

---

## 1. What I've already done (committed to the working tree)

| Change | File |
|---|---|
| Real branded **App Store icon** 1024² (was the default Capacitor logo) | `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` |
| Real branded **launch/splash screen** (was the default blue Capacitor ⚡) | `ios/App/App/Assets.xcassets/Splash.imageset/*` |
| `DEVELOPMENT_TEAM = PHULDKCSY6` on both configs | `ios/App/App.xcodeproj/project.pbxproj` |
| `MARKETING_VERSION` 1.0.0 → **1.1.4** | same |
| `TARGETED_DEVICE_FAMILY` "1,2" → **"1"** (iPhone only — no iPad screenshots/review needed) | same |
| `UIRequiredDeviceCapabilities` armv7 → **arm64** | `ios/App/App/Info.plist` |
| Added **`ITSAppUsesNonExemptEncryption = false`** (skips the export-compliance prompt every build; correct — the app only uses HTTPS/TLS) | same |
| **`codemagic.yaml`** — cloud build → TestFlight | repo root |
| iOS screenshots 1290×2796 (6.7"), raw + lightly framed | `mobile/store/appstore/screenshots/` |
| App Store icon copy for upload reference | `mobile/store/appstore/app-icon-1024.png` |

Usage-description strings for Camera / Photos / Face ID were already present and fine.

**Nothing is committed** — the working tree already had a large redesign; commit
when ready.

---

## 2. App Store Connect — metadata to enter

**App Name:** `HelCalaf`  (must be globally unique on the App Store — if taken,
try `HelCalaf: Marriage Matchmaking`)

**Subtitle** (max 30): `Marriage matchmaking, done right`

**Promotional text** (max 170, editable anytime without review):
`Find a marriage-minded match with real compatibility. Private profiles, mutual matching, and respectful in-app messaging. English & Somali.`

**Description** (max 4000):
```
HelCalaf is a marriage-focused matchmaking app built for the Somali community.
It is designed around serious intentions — finding a spouse — not casual dating.

WHY HELCALAF
• Marriage-first: every profile and conversation is oriented toward nikah.
• Compatibility scoring: answer a structured questionnaire and see how aligned
  you are with each match on values, family, and lifestyle.
• Respectful by design: guided conversations, plus report and block tools.
• Bilingual: full English and Somali (Af-Soomaali).

HOW IT WORKS
1. Create your account and complete your profile and questionnaire.
2. Browse matches and see your compatibility with each one.
3. Start a conversation when there is mutual interest.
4. Take it forward with family when you are both ready.

MEMBERSHIP
Some features require a paid membership. Set up your profile in the app for free;
membership is completed on helcalafkaaga.com in Safari, then unlocks in the app
automatically once you sign back in.

PRIVACY & SAFETY
You control what is on your profile and who sees it. Delete your account and data
any time from Settings. We never sell your personal data.

HelCalaf is for adults 18 and older who are seeking marriage.
```

**Keywords** (max 100 chars, comma-separated, no spaces):
`marriage,muslim,matchmaking,halal,somali,nikah,single,relationship,muslim marriage,muslima`

**Support URL:** `https://www.helcalafkaaga.com`
**Marketing URL** (optional): `https://www.helcalafkaaga.com`
**Privacy Policy URL:** `https://www.helcalafkaaga.com/privacy`

**Primary category:** Lifestyle. **Secondary:** Social Networking.
(Apple has no "Dating" category; dating apps sit in Lifestyle/Social.)

**Age rating:** answer the questionnaire →
- "Unrestricted Web Access": No
- "Made for Kids": No
- Frequent/Intense mature themes: none
- **Dating**: Yes → forces **17+**
- Expected result: **17+**

**Price:** Free. No in-app purchases — App Store Connect's "In-App Purchases"
section should be left empty (see §7, option D).

**Version / What's New (1.1.4):**
```
First public release of HelCalaf for iPhone: accounts, profiles, the compatibility
questionnaire, match discovery, and in-app messaging. English and Somali.
```

---

## 3. App Privacy ("nutrition label") answers

Data collected and **linked to the user**:

| Data | Purpose | Linked? | Tracking? |
|---|---|---|---|
| Name | App Functionality | Yes | No |
| Email Address | App Functionality, Account | Yes | No |
| Photos | App Functionality | Yes | No |
| Messages / User Content | App Functionality | Yes | No |
| Sensitive Info (religious/marital/orientation from the questionnaire) | App Functionality (matching) | Yes | No |
| Coarse Location — **only if** onboarding stores a city; it's typed, not GPS. If unsure, declare "City" under Location, purpose App Functionality | App Functionality | Yes | No |
| Purchases / Payment Info | App Functionality | Yes (status only; card handled by processor) | No |
| Customer Support content | App Functionality | Yes | No |

- **Tracking (ATT):** No. The app has no ad SDKs / cross-app tracking → you do
  **not** need an `NSUserTrackingUsageDescription` or the ATT prompt. If you add
  analytics later, revisit this.
- **Data used to track you:** None.
- Data is **not** sold. Users can request deletion in-app (Settings → Delete
  account) and at `helcalafkaaga.com/delete-account`.
- Encrypted in transit: Yes (ATS enforced, HTTPS only).

> The public privacy policy is thin (collection/use/sharing/rights/contact only).
> Before submitting, add: photos/camera, the payment processors (Paystack/Waafi),
> hosting/retention, and an explicit "no under-18s" line. Apple reviewers read it.

---

## 4. App Review notes (put in the "Notes" box for the reviewer)

```
HelCalaf is a marriage matchmaking app for the Somali community (18+).

Backend: hosted API at https://tel-calafkaaga-1.onrender.com (may cold-start;
first request can take ~30s).

Demo account for review:
  email:    <FILL IN>
  password: <FILL IN>
This account has a completed profile and at least one match + conversation so all
tabs are reachable without payment. Paid features are gated by a membership; the
demo account has membership enabled.

Payments: this build does not sell or unlock any digital content, subscription,
or in-app purchase from within the app, and contains no purchase flow, price, or
"buy" button. Members who want to add a paid membership do so on our website,
https://www.helcalafkaaga.com, outside the app, in Safari (the app links out
there and simply checks membership status when the member returns — no payment
UI, card entry, or checkout of any kind happens inside the app binary). This
mirrors how a multiplatform service account works when purchased on the web.
Happy to walk through this on a call if useful. [See §7 for background.]
```

---

## 5. Codemagic setup (one-time)

1. Sign in at codemagic.io with GitHub/GitLab, add this repo. It will detect
   `codemagic.yaml`.
2. **App Store Connect API key**: App Store Connect → Users and Access → Integrations
   → App Store Connect API → generate a **Team Key** with role *App Manager*.
   Download the `.p8` (once only). Note the **Issuer ID** and **Key ID**.
3. Codemagic → Teams → Integrations → **App Store Connect** → add key, name it
   exactly **`HelCalaf ASC API key`** (matches `codemagic.yaml`).
4. Codemagic → your app → Environment variables → group **`helcalaf_client_env`**:
   - `VITE_API_URL = https://tel-calafkaaga-1.onrender.com`  (Secure ✔ optional)
   - optionally `VITE_SOCKET_URL`, `VITE_APP_URL`, `VITE_STRIPE_PUBLISHABLE_KEY`
5. In App Store Connect, **create the app record**: Apps → + → New App
   - This app record already exists (Apple ID 6811169065, SKU `helcalaf-ios-1`)
     with Bundle ID `com.helcalafkaaga.helcalaf` — no need to create a new one,
     just finish filling in its metadata (see §2/§3 below).
6. Run the `ios-appstore` workflow in Codemagic. It builds the web app, `cap sync`,
   `pod install`, auto-creates the signing cert + provisioning profile via your
   API key, builds the `.ipa`, and uploads it to **TestFlight**.
7. When the build appears in TestFlight, install via TestFlight on an iPhone and
   sanity-check sign-in against the Render API.
8. In App Store Connect: fill everything in §2 + §3, upload the icon (auto from
   build) and the **6.7" screenshots** from `mobile/store/appstore/screenshots/iphone-6.7/`
   (or the framed set), attach the build, answer age rating + export compliance
   (already set to exempt), add the review notes from §4, then **Submit for Review**.

---

## 6. What I need from you

1. **A Mac, or confirmation to use Codemagic.** If Codemagic: create the account +
   the App Store Connect API key (step 5.2) — I can't do that part.
2. **Test account** (email + password) on the live app with a completed profile,
   a match, and membership enabled — for both the review notes (§4) and for me to
   capture the signed-in screenshots (Discover / Matches / Chat / Profile). Right
   now I only have Welcome / Register / Login.
3. **Confirm the app name** `HelCalaf` and that it's free on the App Store.
4. **Privacy policy** — confirm it's live and whether you want it expanded (§3 note).
5. **Payments** — decided: option D in §7 (web checkout, no in-app purchase).
   Still the most likely source of a review rejection; have the §7 fallback
   (option C, hide the button) ready if Apple pushes back.
6. Your **App Store Connect login** stays with you; you do the final "Submit for
   Review". Codemagic only needs the API key.

---

## 7. Payments — the real App Store risk

Apple guideline **3.1.1**: digital content/services consumed **in the app** must
use Apple In-App Purchase (15–30% fee). Apple often argues a paid membership that
unlocks in-app messaging/among users = digital, so **IAP required**. Paystack/Waafi
hosted checkout inside the app can get the build **rejected**.

Options, roughly in order of safety:
- **A.** Add StoreKit IAP for the membership (auto-renewable subscription) and use
  it on iOS only; keep Paystack/Waafi on Android/web. Most reliable; needs dev work
  + a Paid Apps agreement + tax/banking in ASC.
- **B.** Argue "reader"/physical-service exception (3.1.3) — matchmaking as a
  real-world service. Sometimes accepted for matrimony apps; risky, expect a fight.
- **C.** Ship iOS with **no paid membership at all** (browse + profile + limited
  messaging free), monetise elsewhere. Cleanest for a first release; least revenue.
- **D. (IMPLEMENTED, 2026-09-11)** No purchase flow of any kind ships inside the
  iOS binary. `PlansPage` on iOS shows no WaafiPay form and no in-app Paystack
  sheet — instead a "Continue on our website" button opens
  `https://www.helcalafkaaga.com/login` in the system browser
  (`@capacitor/browser`, SFSafariViewController — `src/platform/web-checkout.ts`).
  The member signs in / pays there (same account, same Render backend as the
  website), then the app re-checks access when the browser closes or the app
  resumes, and unlocks automatically. Android is untouched — it still pays
  in-app via WaafiPay/Paystack (commit in `redesign/web-warm`-era mobile work).

  **This is not a guaranteed pass.** It avoids the worst violation (an in-app
  checkout UI / iframe / card form), which is the version of 3.1.1 Apple flags
  most reliably, but Apple can still reject a build that has *any* path —
  even an external link — to pay for something usable inside the app, unless
  it also qualifies as a genuine "reader"/multiplatform-service app (§7 option B)
  or uses Apple's restricted External Purchase Link Entitlement (region-gated,
  requires its own ASC approval, not implemented here). Treat D as the pragmatic
  middle ground while testing the waters with a real submission — if Apple
  rejects citing 3.1.1, the fallback is option C (hide the "Continue on our
  website" button entirely, ship browsing-only) or option A (real StoreKit IAP).

---

## 8. Caveats

- Screenshots so far are public screens only (need #6.2).
- `ios/App/App/capacitor.config.json` is a generated file still showing the old
  maroon splash colour; `cap sync ios` in the Codemagic build regenerates it from
  `capacitor.config.ts` (`#2e5e4e`). Not a problem for CI builds.
- No StoreKit / IAP code exists yet (see §7).
- The Render free tier cold-starts; fine for review but consider a paid tier / real
  domain before a public launch.
