# Data Safety draft (Google Play) — Hel Calafkaaga

**Status:** Engineering draft for legal/product confirmation. Not a final Play Console submission.

**Package:** `com.helcalaf.app`  
**Based on:** Nest API + Capacitor client as of release candidate `1.0.0`

## Summary

The app collects account and profile data required for matchmaking, stores messages and photos on server-side infrastructure, and processes payments through Stripe (and optionally EVC). Data is transmitted over HTTPS. Account deletion is available in-app.

## Inventory

| Data type | Collected? | Shared with third parties? | Required? | Purpose | Encrypted in transit? | User deletion supported? | Notes / legal confirm |
|-----------|------------|----------------------------|-----------|---------|----------------------|-------------------------|------------------------|
| Name | Yes | No (except processors under contract) | Yes for profile | App functionality | Yes (HTTPS) | Yes via account deletion | Profile display name |
| Email | Yes | Mail provider (transactional) | Yes | Account / security | Yes | Yes | Auth identifier |
| Phone | Optional / conditional | Possibly SMS/mail processors | Optional | Contact / wali fields | Yes | Yes | Product must confirm when required |
| User IDs | Yes | No (internal) | Yes | App functionality | Yes | Yes | Opaque / UUID / convexId |
| Profile photos | Yes | Object storage (S3-compatible) | Strongly expected | App functionality | Yes (signed URLs) | Yes | Temporary signed download URLs |
| Messages | Yes | No (server storage) | If user messages | App functionality | Yes | Yes (with account deletion) | Not E2E encrypted — do not claim E2E |
| Approximate location | Possibly country/city from profile | No | Profile fields | Matching | Yes | Yes | Self-reported; confirm geolocation verify usage |
| Precise location | API path exists; **mobile UI does not call geolocation** | No | Optional server feature | Fraud / verification | Yes | Yes | Do not declare as collected from the app until UI ships |
| Payment info | Card handled by Stripe; app sees status | Stripe | For paid access | Payments | Yes | Partial (Stripe retention) | App does not store PAN |
| Purchase history | Payment status / plan flags | Stripe | For paid users | App functionality | Yes | Account deletion + Stripe policies | |
| Device identifiers | Capacitor / OS may expose; app uses secure session token | No analytics SDK currently | Session | App functionality / security | Yes | Session cleared on logout | Confirm no third-party analytics added |
| Diagnostics | Not shipped as a dedicated crash SDK in client | N/A | N/A | N/A | N/A | N/A | **Confirm CI/ops crash tools** |
| App interactions | Server logs may retain request metadata | Hosting provider | Ops | Fraud prevention / security | Yes | Retention policy TBD | Legal confirm retention |
| Search history | No dedicated search product | No | No | — | — | — | |
| Contacts | Not collected | No | No | — | — | — | |
| Audio / voice messages | Not implemented | No | No | — | — | — | |
| Files (other) | Chat/profile images only | Object storage | As uploaded | App functionality | Yes | Yes | |
| Reports / moderation | Yes | Staff/moderation tooling | When user reports | Safety / fraud | Yes | Retention may apply | Legal confirm |

## Declarations needing legal sign-off

1. Whether precise location is ever collected from production mobile builds  
2. Exact retention windows for messages, photos, and moderation reports  
3. Whether transactional email/SMS providers are “sharing” under Play definitions  
4. Whether any analytics / crash reporter will be added before launch  
5. Whether biometric unlock data is declared (local OS biometrics only — no biometric templates leave device)

## Account deletion

In-app: Settings → Delete account (password + confirmation). Server executes deletion; client clears secure storage, drafts, biometric flag, and caches after success.
