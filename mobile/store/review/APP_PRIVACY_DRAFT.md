# App Privacy draft (Apple) — Hel Calafkaaga

**Status:** Engineering draft for App Store Connect privacy labels. Requires legal/product confirmation.

**Bundle ID:** `com.helcalafkaaga.helcalaf`

## Data linked to identity (expected)

| Category | Types | Purposes | Tracking? |
|----------|-------|----------|-----------|
| Contact Info | Email, Name, Phone (if provided) | App Functionality, Account Management | No |
| User Content | Photos, Messages, Profile answers | App Functionality | No |
| Identifiers | User ID | App Functionality | No |
| Purchases | Purchase History / subscription-like access flags | App Functionality | No |
| Location | Coarse (city/country profile); Precise only if geolocation verify used | App Functionality / Fraud Prevention | No — confirm |

## Data not collected (current client evidence)

| Category | Status |
|----------|--------|
| Contacts | Not collected |
| Health & Fitness | Not collected |
| Sensitive Info (beyond marital/religious questionnaire answers stored as profile content) | Treat questionnaire answers as **User Content / Sensitive** — legal confirm labeling |
| Usage Data (product analytics SDK) | No dedicated analytics SDK in Capacitor client |
| Diagnostics (crash SDK) | No dedicated crash SDK wired |
| Audio / voice messages | Feature not implemented |
| Browsing History | Not collected |

## Tracking

No App Tracking Transparency / advertising identifier usage found in the Capacitor client. Do **not** declare tracking unless ads or cross-app tracking are added.

## Third parties

- **Stripe** — payment processing  
- **S3-compatible storage** — media objects  
- **Email driver** — transactional mail  
- **Hosting / logging** — infrastructure

## Biometrics

Face ID / fingerprint unlock is a **local device convenience lock**. Biometric templates are not uploaded. Declare only if Apple questionnaire requires mentioning device authentication; templates are not app-collected data.

## Product confirmation required

1. Precise location collection in production mobile  
2. Questionnaire fields classified as Sensitive Info  
3. Retention + deletion timelines for App Review answers  
4. Whether any analytics will ship in RC builds
