# Google Play release — Tel Calafkaaga

**Engineering guide — not legal advice. Does not claim Play approval.**

## Requirements

- Google Play Console account
- Package name: `com.telcalafkaaga.app`
- Release signing keystore (create once, back up offline — never commit)

## Keystore (local only)

```bash
keytool -genkey -v -keystore ~/tel-calafkaaga-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias telcalafkaaga
```

Copy `apps/client/android/key.properties.example` → `apps/client/android/key.properties` (gitignored) and fill paths/passwords.

`app/build.gradle` loads signing configs automatically when `key.properties` exists.

## Build AAB

```bash
cd apps/client
# Production HTTPS API required:
# VITE_API_URL=https://api.example.com
# VITE_SOCKET_URL=https://api.example.com
# VITE_USE_LOCAL_DEMO=false
npm run build
npx cap sync android
cd android
./gradlew bundleRelease
# Output: app/build/outputs/bundle/release/app-release.aab
sha256sum app/build/outputs/bundle/release/app-release.aab
```

Prefer Play App Signing. Keep the upload key backup.

**versionName:** `1.0.0`  
**versionCode:** `1` for first upload — increment for every subsequent Play upload.

## Tracks

1. Internal testing ← RC1 target
2. Closed testing
3. Open testing (optional)
4. Production staged rollout (e.g. 10% → 100%) — only after billing policy sign-off

## Console forms

| Topic | Engineering draft |
|-------|-------------------|
| Ads | No ads |
| Target audience | Adults 18+ |
| Content rating | IARC for social / dating-adjacent UGC |
| Data safety | See `store/review/DATA_SAFETY_DRAFT.md` |
| Account deletion | Settings → Delete account + support email |
| App access | Demo account via console notes |
| Sensitive permissions | Camera / photos for profile pictures |
| Payments | **Pending** `STORE_POLICY_DECISIONS.md` |

## Assets

| Asset | Location |
|-------|----------|
| Feature graphic 1024×500 | `store/android/feature-graphic/feature-graphic-1024x500.png` |
| High-res icon | `store/android/icon/ic_launcher_1024.png` |
| Adaptive layers | `store/android/icon/ic_launcher_*_1024.png` |
| Screenshots | Replace placeholders in `store/android/screenshots/{en,so}/` |
| Listing copy | `store/copy/en/listing.md`, `store/copy/so/listing.md` |

## Tester credentials

Disposable Nest staging accounts only. Never commit passwords.
