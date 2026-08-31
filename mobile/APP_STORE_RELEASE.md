# Apple App Store release — Tel Calafkaaga

**Requires macOS + Xcode + Apple Developer Program. This Linux environment cannot archive iOS.**

Engineering guide — not legal advice. Does not claim App Review approval.

## Identity

- Bundle ID: `com.telcalafkaaga.app`
- Display name: Tel Calafkaaga
- Marketing version: `1.0.0`
- Build (`CURRENT_PROJECT_VERSION`): `1` — increment each TestFlight upload

## Process (macOS)

```bash
cd apps/client
# VITE_API_URL=https://api.example.com (HTTPS required)
npm run build
npx cap sync ios
cd ios/App && pod install
open App.xcworkspace
# Signing & Capabilities → Team
# Product → Archive → Validate App → Distribute → TestFlight
```

## Capabilities & privacy strings

Configured in `Info.plist`:

- Camera
- Photo library read / add
- Face ID (`NSFaceIDUsageDescription`)
- URL scheme `telcalafkaaga`

Do **not** enable unused background modes, Push (until implemented), HealthKit, or unrestricted ATS.

## App Store Connect

- Privacy Policy URL + Support URL
- Age rating (adult dating/social UGC)
- Export compliance (HTTPS — confirm exemption)
- App Privacy labels — draft in `store/review/APP_PRIVACY_DRAFT.md`
- Review notes — `store/review/app-review-notes.md`
- Account deletion path
- **In-App Purchase** decision — see `STORE_POLICY_DECISIONS.md` (**blocker** for production)

## Assets

| Asset | Location |
|-------|----------|
| 1024×1024 icon (no transparency) | `store/ios/icon/AppIcon-1024.png` |
| Screenshots | Replace placeholders in `store/ios/screenshots/{en,so}/` |
| Listing copy | `store/copy/en/listing.md`, `store/copy/so/listing.md` |

## TestFlight

Internal testing is the RC1 target. External TestFlight / App Review requires billing policy clarity and real screenshots.
