# HelCalaf — Google Play submission pack

Generated 2026-09-06. Everything in `mobile/store/play/` is ready to upload to the
Play Console. This app is an **Android Capacitor app** — it goes to **Google Play**,
not Apple's App Store (iOS needs a Mac + Apple Developer account; see the bottom).

---

## 1. What is ready (in this folder)

| File | Play Console field | Notes |
|---|---|---|
| `HelCalaf-1.1.4-15-release.aab` | Production/testing release → App bundle | Signed with the upload key. 3.6 MB. `versionCode 15`, `versionName 1.1.4`. |
| `icon-512.png` | Store listing → App icon | 512×512, 32-bit PNG. |
| `feature-graphic.png` | Store listing → Feature graphic | 1024×500. |
| `screenshots/phone/framed-welcome.png` | Store listing → Phone screenshots | 1080×1920 |
| `screenshots/phone/framed-register.png` | " | 1080×1920 |
| `screenshots/phone/framed-login.png` | " | 1080×1920 |
| `screenshots/phone/*.png` (raw) | — | Un-framed 1080×2340 captures if you want to re-crop. |

Play needs **min 2** phone screenshots; 3 framed ones are here. The signed-in
screens (Discover, Matches, Chat, Profile) would sell the app far better — see
"What I need from you" #4.

---

## 2. Signing / keystore — READ THIS

- Upload keystore: `mobile/apps/client/android/.signing/helcalaf-upload.jks`
  (alias `helcalaf`), credentials in `.signing/UPLOAD_KEY_CREDENTIALS.txt`.
- Config: `mobile/apps/client/android/key.properties` (git-ignored). I fixed its
  `storeFile` path — it pointed at an old machine location and the release build
  would have failed.
- Upload cert fingerprints (for Play App Signing / API console / Firebase):
  - SHA-1: `13:D5:44:FF:42:83:9F:41:C1:EB:16:EB:6F:B5:B7:C3:D5:33:48:99`
  - SHA-256: `99:47:75:3C:9D:AE:4B:1A:87:86:62:B0:0C:F6:0E:43:04:7D:C0:E7:2E:65:F1:91:83:53:BC:17:41:DC:91:78`
- **Back up `helcalaf-upload.jks` + its passwords somewhere off this machine
  now.** If it is lost you can ask Google to reset the upload key (Play App
  Signing), but only if Play App Signing is enabled at app creation — keep it
  enabled (it is the default).
- Neither the keystore nor `key.properties` is in git (correct). Don't commit them.

To rebuild the AAB later:
```
cd mobile && JAVA_HOME=$PWD/.jdks/jdk-21 ANDROID_HOME=~/Android/Sdk npm run mobile:android:release
# → apps/client/android/app/build/outputs/bundle/release/app-release.aab
```

---

## 3. Store listing copy (English — paste into Play Console)

**App name** (max 30): `HelCalaf`

**Short description** (max 80):
`Halal, marriage-focused matchmaking and compatibility for the Somali community.`

**Full description** (max 4000):
```
HelCalaf is a marriage-focused matchmaking app built for the Somali community.
It is designed around serious intentions — finding a spouse — not casual dating.

WHY HELCALAF
• Marriage-first: every profile and conversation is oriented toward nikah.
• Compatibility scoring: answer a structured questionnaire and see how aligned
  you are with each potential match on values, family, and lifestyle.
• Respectful by design: guided conversations, report and block tools, and a
  team that reviews reports.
• Bilingual: full English and Somali (Af-Soomaali) support.

HOW IT WORKS
1. Create your account and complete your profile and questionnaire.
2. Browse matches and see your compatibility with each one.
3. Start a conversation when there is mutual interest.
4. Take it forward with family when you are both ready.

MEMBERSHIP
Some features require a paid membership. Payments are handled by trusted
processors. You can use the app to browse and set up your profile for free.

PRIVACY & SAFETY
You control what is on your profile and who can see it. You can delete your
account and data at any time from Settings. We never sell your personal data.

HelCalaf is for adults 18 and older who are seeking marriage.
```

**Somali short description** (optional, if you add the `so-SO` listing):
`Barta guurka ee bulshada Soomaaliyeed — is-waafajin iyo doorasho xalaal ah.`

---

## 4. App content / policy answers (draft — you confirm & submit in Console)

**Category:** Dating (or "Lifestyle" if you prefer softer positioning; Dating
apps get extra policy scrutiny and a mandatory declaration — see below).

**Tags:** matchmaking, marriage, Somali, compatibility.

**Contact details:** email `support@helcalafkaaga.com` (from repo constants).
Add a website: `https://www.helcalafkaaga.com`.

**Privacy Policy URL:** `https://www.helcalafkaaga.com/privacy` (page exists).
> The current policy is short. Before launch, expand it to name: photos/camera
> use, the payment processors (Paystack, Waafi), where data is hosted, retention,
> and that under-18s may not use the app. Not a hard blocker but reviewers on
> dating apps look for it.

**Account deletion URL:** `https://www.helcalafkaaga.com/delete-account` (page
exists — required because the app has accounts).

**Ads:** No ads → declare "No".

**Content rating (IARC questionnaire) — expected answers:**
- App category: Social / Communication or Dating.
- User-generated content + user interaction: **Yes** (profiles, chat).
- Users can share content / communicate: **Yes**.
- Is it a dating app: **Yes**.
- Sexual content / nudity: No. Violence: No. Profanity: No. Controlled
  substances: No. Gambling: No.
- → Expected rating: **Mature 17+ / PEGI 16-18** (dating apps always land here).

**Target audience & content:** Target age group **18+ only**. Do not check any
under-18 bucket (the app itself enforces 18+ at registration).

**Data safety form — the app collects:**
| Data type | Collected | Shared | Purpose | Optional? |
|---|---|---|---|---|
| Name | Yes | With other users (profile) | App functionality, matchmaking | Required |
| Email address | Yes | No | Account management, comms | Required |
| Photos | Yes | With other users (profile) | App functionality | Optional |
| Messages (in-app) | Yes | With the other participant | App functionality | Required to chat |
| Approx. location | If you added it to onboarding — check | With other users | Matchmaking | Optional |
| Sexual orientation / religious/marital info | Yes (questionnaire) | With other users as match info | Matchmaking | Required for matching |
| Payment info | Processed by Paystack/Waafi, **not stored by the app** | With payment processor | Purchases | Required to pay |
| App interactions / diagnostics | If analytics present — check | No | Analytics | — |

- Data encrypted in transit: **Yes** (HTTPS enforced).
- Users can request deletion: **Yes** (`/delete-account` + in-app Settings).
- Android permissions in the build: `INTERNET`, `ACCESS_NETWORK_STATE`,
  `CAMERA` (profile photos), `READ_MEDIA_IMAGES` (pick photos). No location
  permission is declared in the manifest — if onboarding asks for a city it is
  typed, not device GPS, so answer location = "not collected" unless you know
  otherwise.

**Government app / financial features / health:** No.

---

## 5. First-release flow in Play Console

1. Create the app: name `HelCalaf`, default language English (US), type App,
   Free. Keep **Play App Signing** enabled.
2. Fill: App access (if any screens need a login to review, give them a test
   account — see #4 below), Ads (No), Content rating, Target audience, Data
   safety, Government apps (No), Financial features (No), Privacy Policy URL.
3. Store listing: paste copy from §3, upload icon + feature graphic + the 3
   screenshots.
4. **Start with Closed testing** (an internal or closed track), not Production —
   upload `HelCalaf-1.1.4-15-release.aab`, add testers, verify install + sign-in
   against the Render API, then promote to Production.
5. If Play says `versionCode 15` is already used (from an earlier upload), bump
   `versionCode` in `mobile/apps/client/android/app/build.gradle` and rebuild.

---

## 6. What I need from you

1. **Google Play developer account** — confirm you have one (one-time $25). I
   can't access the Console; you do the uploads. If you want, I can prepare a
   `fastlane supply` config so future releases upload from the CLI — that needs a
   service-account JSON you generate in the Console.
2. **Final app name for the store** — confirmed as `HelCalaf`? (repo also says
   "Calafdoon" / "Tel Calafkaaga" in places — tell me if the public name differs.)
3. **Privacy policy** — confirm `https://www.helcalafkaaga.com/privacy` and
   `/delete-account` are live and reachable, and whether you want me to expand
   the policy text (§4 note) before submitting.
4. **Better screenshots of the signed-in app.** Either:
   - give me a **test account** (email + password) on the live app and I'll
     capture Discover / Matches / Messages / Chat / Profile, or
   - take them on your phone (Power + Volume-Down), and I'll pull and frame them.
5. **Category** — Dating or Lifestyle?
6. **Content rating** — confirm 18+ and the answers in §4, or send corrections.
7. **Backup confirmation** — tell me where you've backed up the upload keystore
   so I know it's safe.
8. **iOS?** — if you also want the App Store: you need a Mac (or a cloud-Mac CI
   like Codemagic/EAS) + an Apple Developer account ($99/yr). The `ios/` project
   exists in the repo but cannot be built or submitted from this Linux machine.
   Say the word and I'll prep the iOS metadata + a CI config.

---

## 7. About the older `mobile/store/` files

A previous session left a store pack under `mobile/store/android/`, `mobile/store/copy/`,
`mobile/store/ios/`, `mobile/store/review/` and `listing-en.md` / `listing-so.md`. **It is
stale** — it uses the old name "Hel Calafkaaga", the retired maroon branding, and
**Stripe** (payments are now Paystack + Waafi). Its screenshots are mockup
placeholders, not real captures.

- **This folder (`mobile/store/play/`) is the current source of truth for the Play
  submission.** Use the copy, icon, feature graphic and screenshots here.
- Still useful from the old pack: `review/DATA_SAFETY_DRAFT.md` and
  `review/APP_PRIVACY_DRAFT.md` as structure — but swap Stripe → Paystack/Waafi,
  fix the app name, and reconcile against §4 here before submitting.
- `review/demo-account-template.md` — fill this in for the "App access" step.

## 8. Not done / caveats

- `web/`, `mobile/apps/client` and other files have a large uncommitted redesign
  in the working tree. The AAB was built from that working tree (current code,
  incl. the new chat screen). Commit when you're ready — nothing here was
  committed.
- No analytics/crash reporting SDK was verified; the Data safety "diagnostics"
  row is a guess. Check if `google-services.json` / Firebase is wired before
  answering that.
- The privacy policy is thin (see §4).
