# iOS handoff checklist (send to Apple developer)

Print or tick before handing Mac access / repo.

## From product owner (fill before send)

- [ ] Apple Developer Team invited / App Store Connect access granted  
- [ ] Production API HTTPS URL confirmed: `____________________________`  
- [ ] API CORS includes `capacitor://localhost` and `https://localhost`  
- [ ] Waafi keys live on API **or** prepaid demo account for review  
- [ ] Privacy Policy URL: `____________________________`  
- [ ] Support URL: `____________________________`  
- [ ] Demo reviewer email + password (secure channel only — not git)  
- [ ] Billing decision noted: TestFlight-only / IAP planned / counsel OK (see `STORE_POLICY_DECISIONS.md`)  

## Repo / project

- [ ] Clone or zip of `calafdoon` (at least `mobile/`)  
- [ ] Read `IOS_DEVELOPER_HANDOFF.md`  
- [ ] Bundle ID is `com.helcalafkaaga.helcalaf` (do not change without App Store Connect app record)  
- [ ] `apps/client/.env.production` created from `.env.production.example` (gitignored)  

## On Mac (developer)

- [ ] `npm install` in `mobile/`  
- [ ] `npm run build` + `npx cap sync ios` in `apps/client`  
- [ ] `pod install` in `ios/App`  
- [ ] Open `App.xcworkspace` (not `.xcodeproj`)  
- [ ] Signing Team selected  
- [ ] Archive → Upload → TestFlight internal  
- [ ] Replace screenshot placeholders with real device captures  
- [ ] App Privacy questionnaire matches `store/review/APP_PRIVACY_DRAFT.md`  

## Do not

- [ ] Do not enable cleartext HTTP / ATS exceptions for store builds  
- [ ] Do not commit `.env.production`, certificates, or provisioning profiles  
- [ ] Do not submit production App Review until billing policy is decided  
