# Privacy data map — Tel Calafkaaga (engineering)

Statements must match this map. Do **not** claim on-device-only storage, E2EE, or “no tracking” unless implemented.

| Data | Collected? | Stored where | Purpose |
|------|------------|--------------|---------|
| Email / password hash | Yes | PostgreSQL | Auth |
| Session tokens | Yes | DB (hashed) + client secure storage | Auth |
| Profile / questionnaire | Yes | PostgreSQL | Matching |
| Photos | Yes | S3-compatible object storage | Profile |
| Likes / matches | Yes | PostgreSQL | Matching |
| Messages | Yes | PostgreSQL (+ realtime Socket.IO) | Chat |
| Blocks / reports | Yes | PostgreSQL | Safety |
| Payment metadata | Yes | PostgreSQL + Paystack / WaafiPay (app), Stripe (website) | Access gating |
| Device push tokens | No (not implemented) | — | — |
| Approximate location | Yes — coarse GPS requested in onboarding; API reverse-geocodes (OpenStreetMap Nominatim receives coordinates only) and stores city, country, approx. coordinates, accuracy, verified-at on `profiles` | PostgreSQL | Show people nearby (other members see city + country only) |
| Precise location | No — `ACCESS_COARSE_LOCATION` only; clients cannot write location fields (server strips them) | — | — |
| Analytics SDK | Not added by default | — | — |

## Deletion

In-app deletion calls `POST /auth/delete-account` after password confirm. Server runs `DeletionService.executeSelf`. Media objects may be orphaned pending bucket lifecycle (documented in deletion service comments) — **product must state retention honestly**.

## Third parties

Stripe (payments), S3/R2 (media), email provider (Resend when configured), hosting provider.
