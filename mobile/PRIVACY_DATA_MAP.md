# Privacy data map — Tel Calafkaaga (engineering)

Statements must match this map. Do **not** claim on-device-only storage, E2EE, or “no tracking” unless implemented.

| Data | Collected? | Stored where | Purpose |
|------|------------|--------------|---------|
| Email / password hash | Yes | PostgreSQL | Auth |
| Session tokens | Yes | DB (hashed) + client secure storage | Auth |
| Profile / questionnaire | Yes | PostgreSQL | Matching |
| Photos | Yes | S3-compatible object storage | Profile |
| Profile video (optional, ≤30 s) | Yes | Bunny Stream (Bunny.net); DB keeps video id + status only | Profile; shown only to members allowed to see the profile; deleted on remove / replace / account deletion (retry queue) |
| Verification selfie (optional) | Yes | Private S3 bucket; DB `photo_verifications` | Staff review for the verified badge; never shown to members; file + record deleted 30 days after the decision |
| Online status / last seen | Yes (last active time; presence in Redis) | PostgreSQL / Redis | Shown to active matches only; member can hide it (Settings → Privacy) |
| Notification preferences, chat mutes | Yes | PostgreSQL | Respect the member's choices |
| Staff access to chats | Yes — authorised admins can read conversations (admin tools) | — | Investigate reports / safety; disclosed in the Privacy Policy |
| Likes / matches | Yes | PostgreSQL | Matching |
| Messages | Yes | PostgreSQL (+ realtime Socket.IO) | Chat |
| Blocks / reports | Yes | PostgreSQL | Safety |
| Payment metadata | Yes | PostgreSQL + Paystack / WaafiPay (app), Stripe (website) | Access gating |
| Device push tokens (FCM) | Yes — only after the member allows notifications; token + platform stored, deleted on sign-out/uninstall cleanup or account deletion | PostgreSQL (`device_push_tokens`); delivery via Google Firebase Cloud Messaging | Send message / like / match / announcement notifications |
| Approximate location | Yes — coarse GPS requested in onboarding; API reverse-geocodes (OpenStreetMap Nominatim receives coordinates only) and stores city, country, approx. coordinates, accuracy, verified-at on `profiles` | PostgreSQL | Show people nearby (other members see city + country only) |
| Precise location | No — `ACCESS_COARSE_LOCATION` only; clients cannot write location fields (server strips them) | — | — |
| Analytics SDK | Not added by default | — | — |

## Deletion

In-app deletion calls `POST /auth/delete-account` after password confirm. Server runs `DeletionService.executeSelf`. Media objects may be orphaned pending bucket lifecycle (documented in deletion service comments) — **product must state retention honestly**.

## Third parties

Stripe, Paystack, WaafiPay (payments), S3/R2 (media), Bunny.net / Bunny Stream (profile videos), Google Firebase Cloud Messaging (push notifications), OpenStreetMap Nominatim (reverse geocoding), Resend (email), Render and Vercel (hosting).
