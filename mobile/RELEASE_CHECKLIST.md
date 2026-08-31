# Release checklist — Tel Calafkaaga v1

## Code

- [x] Release branch cut (`release/mobile-v1-rc1`)
- [x] Clean Git state before tagging (verify at tag time)
- [x] Versions aligned at `1.0.0` / Android `versionCode` 1 / iOS build 1 (`VERSIONING.md`)
- [x] Client typecheck / lint / unit tests (run on RC machine)
- [x] Production Vite build rejects localhost
- [x] Bundle budget script present
- [x] Release security audit script present
- [ ] No secrets in tree / CI logs (human review)
- [ ] Tag `v1.0.0-rc1` after device QA sign-off

## Backend

- [ ] Staging deployed
- [ ] Migrations applied
- [ ] Health `/health/live` and `/health/ready` green
- [ ] Unit tests green
- [ ] Stripe test mode verified
- [ ] Email verified
- [ ] Redis / storage / Socket.IO verified
- [ ] Disposable account deletion smoke
- [ ] Smoke: register → login → discover → message → logout

## Android

- [x] Manifest: no production cleartext; backup disabled + extraction rules
- [x] Optional `key.properties` signing wired (local only)
- [x] ProGuard keep rules for Capacitor + biometrics
- [ ] `./gradlew lintDebug` on SDK machine
- [ ] `./gradlew assembleDebug`
- [ ] `./gradlew bundleRelease` (with upload keystore)
- [ ] Artifact inspection (package, version, no localhost)
- [ ] Physical device / emulator QA before upload
- [ ] Real screenshots replace placeholders
- [ ] Play internal testing track upload
- [ ] Data Safety form submitted (from draft)

## iOS

- [x] Info.plist privacy strings (camera, photos, Face ID)
- [x] ATS arbitrary loads false
- [ ] `pod install` + Simulator build (macOS)
- [ ] Archive + validation
- [ ] TestFlight upload
- [ ] Physical iPhone QA
- [ ] Real screenshots
- [ ] App Privacy labels submitted (from draft)

## Product and policy

- [ ] Privacy Policy live URL reviewed
- [ ] Terms live URL reviewed
- [ ] Safety / guidelines consistent (`store/review/PRIVACY_TERMS_CONSISTENCY.md`)
- [ ] **Payment / IAP decision signed** (`STORE_POLICY_DECISIONS.md`) — **blocker for production stores**
- [ ] Age rating questionnaires completed
- [ ] Account deletion documented for reviewers
- [ ] Blocking / reporting documented

## Store metadata

- [x] Listing drafts EN/SO
- [x] Icon + feature graphic source assets generated
- [ ] Screenshots captured from devices
- [ ] Support / privacy URLs confirmed live

## Release

- [ ] Internal testers invited
- [ ] Demo / review accounts prepared (not in git)
- [ ] Rollback plan reviewed
- [ ] Monitoring / support readiness
- [ ] Final go / no-go recorded before production rollout
