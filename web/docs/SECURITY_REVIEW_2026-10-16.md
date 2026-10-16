# Security review — 2026-10-16

Scope: the repository (API, website, Android app), the live API host (light, non-destructive probes:
headers, CORS, unauthenticated access, webhook signatures, a handful of single requests) and the Android
build. Not covered: authenticated black-box testing on production (needs test accounts), load/DoS,
fuzzing, and the third-party platforms (Render, Cloudflare, Bunny, Vercel).

## Fixed in this review
| Severity | Finding | Fix |
|---|---|---|
| Medium | The production API publicly served an old **debuggable** APK (`com.telcalafkaaga.app` v1.0.0) at `/download` and `/download/web.apk`. | APK removed; `/download` redirects to the Google Play listing; the APK URL answers 410. |
| Medium (privacy) | Online/offline presence was broadcast to **every** connected user. | Presence is now sent only to the member's active matches, and not at all when the member hides it. |
| Low–Medium (privacy) | "Last seen" was included on discover cards for people you are not matched with. | Returned only for active matches. |

## Open / recommended
| Severity | Finding | Recommendation |
|---|---|---|
| Low | A Firebase **admin** key file sits in `~/Downloads` (the key is already in Render). | Delete the local copy; rotate the key if the machine is shared. |
| Low | `POST /auth/register/check-email` returns `{available: true/false}` (account enumeration; rate-limited). | Accept as a sign-up trade-off, or make the response generic and report taken emails only at submit. |
| Low | Website CSP allows `script-src 'unsafe-inline'`. | Move to nonce-based CSP when practical. |
| Low | Malformed JSON bodies return the parser's message. | Replace with a generic "Invalid request body". |
| Info | Sessions last 90 days idle / 1 year absolute. | Acceptable; keep "sign out everywhere" available. |
| Info | Password policy is length ≥ 8 with no breached-password check. | Add a common-password blocklist. |
| Info | Bunny TUS signatures do not bind file size. | Mitigated by short credentials, one pending upload, rate limits and post-processing checks. |
| Info | Two API test suites need a live database and were not run here. | Run them in CI against a test database. |

## Verified good
- No secrets in the repo, history, or app bundle; `.env`, keystores and signing files are git-ignored.
- `npm audit` (production dependencies): 0 vulnerabilities in web and mobile.
- CORS is an allowlist (evil origins get no `Access-Control-Allow-Origin`); credentials only for allowed origins.
- Every protected route answered 401 without a session; webhooks reject unsigned requests (Bunny HMAC, Stripe, Paystack).
- Security headers (HSTS, nosniff, frame protection, referrer policy) on API and website; strict CSP on the website.
- Profile updates use a field allowlist (no role / payment / approval fields); owner and participant checks on chat,
  notifications, photos, matches, media; private media only for owner/staff.
- Session cookies are HttpOnly + Secure, CSRF double-submit; passwords hashed with scrypt/argon2id and compared in
  constant time; login and password reset give generic responses; rate limits on auth and uploads.
- No raw SQL, no `eval`/shell, no user-controlled server-side URLs; server-generated storage keys.
- Android: no cleartext traffic, backups disabled, one exported activity, deep links allow-listed, release build not debuggable.
