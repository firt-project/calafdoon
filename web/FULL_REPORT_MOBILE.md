# Hel Calafkaaga — Full Product & Technical Report (Mobile App)

**Audience:** Backend / platform / frontend / mobile / Play Store engineers  
**Product:** Halal Muslim marriage matchmaking (**native mobile app**)  
**Last updated:** 3 August 2026  
**Marketing site:** `https://helcalafkaaga.com` / `https://www.helcalafkaaga.com`  
**Production API:** NestJS on Render — browser via `https://api.helcalafkaaga.com` (rollback: `https://tel-calafkaaga-1.onrender.com`)  
**App ID:** `com.telcalafkaaga.app` · Version `1.0.0` · Capacitor `7.x`

> Canonical filename: **`FULL_REPORT_MOBILE.md`**  
> This file is the mobile / Play Store handoff. It pairs with `FULL_REPORT.md` (website) in this Next.js monorepo.  
> Both clients share **one NestJS API**. Do **not** use Convex, free-trial unlock, or outdated pricing as current truth.

---

## 0. Important: two repos

| Repo | What it contains | Deploy |
|------|------------------|--------|
| **This workspace** (`Hel-Calafkaaga`) | Next.js website (`src/`) + Nest API (`apps/api`) | Vercel + Render |
| **Mobile monorepo** (separate) | Capacitor client (`apps/client`) + Android/iOS + Nest (or shared API) | Play / App Store + Render |

**In this website workspace there is no `apps/client` / `android/` folder.**  
Play Store builds require the Capacitor monorepo (or adding Capacitor here later).  
Keep this report as the shared product/API truth for mobile engineers.

Related (mobile repo when present): `README.md`, `PRIVACY_DATA_MAP.md`, `ACCOUNT_DELETION.md`, `STORE_POLICY_DECISIONS.md`, `RELEASE_CHECKLIST.md`, `store/README.md`.

---

## 1. What this product is

Hel Calafkaaga connects Muslim men and women seeking **marriage** (not casual dating).

### Member journey (server-enforced)

```
Register (email + password)
  → Email verification (M3)
  → Choose gender
  → Complete questionnaire (+ photo)
  → Pay (Stripe card OR EVC / M-PESA proof)
  → (Women on Basic: may wait for admin profile approval)
  → Home / Discover / Matches / Chat
```

Forced password reset (M4) and staff MFA (L4) can interrupt that flow when the API requires them.

### Staff

`admin` / `owner` manage members, payments (Stripe + EVC), reports, support, announcements, and invites.

**Staff profiles are hidden from member Discover / matches / likes / chat.**  
Members must never see admin/owner cards or photos on dating surfaces (`shouldHideProfileFromViewer`).

Photo privacy copy like “Visible to everyone / Members browsing Discover can see your photos” applies to **member → member** privacy settings — **not** to staff accounts.

---

## 2. Technology stack (current)

| Layer | Technology |
|--------|------------|
| Mobile UI | **Capacitor 7** + React + Vite + TypeScript (`apps/client` in mobile repo) |
| Website UI | **Next.js** (`src/` in this repo) on Vercel |
| Frontend data | REST + Socket.IO → Nest (`NEXT_PUBLIC_*` website / `VITE_*` mobile) |
| Backend | **NestJS** (`apps/api`) |
| Database | **PostgreSQL** via **Prisma** |
| Cache / queues / rate limits | **Redis** (+ BullMQ) |
| Object storage | S3-compatible (MinIO local; R2/S3 production) |
| Realtime chat | **Socket.IO** |
| Payments | **Stripe Checkout** + **manual EVC / M-PESA** proof review |
| Email | Resend when `MAIL_DRIVER=resend` |
| Auth | Nest sessions + CSRF; website = HttpOnly cookies; mobile may use secure storage for session token |
| Languages | Somali + English |
| Hosting | **Render** (API) · **Vercel** (website) · native builds for Play / App Store |

### Layout (mobile monorepo)

```
apps/
  api/                 NestJS API + Prisma (shared with website)
  client/              Capacitor app (React + Vite)
    android/           Native Android (com.telcalafkaaga.app)
    ios/               Native iOS (needs macOS)
packages/
  api-client/          Shared HTTP/Socket adapters (if present)
  migration/           Legacy Convex → Postgres tooling
infra/
  docker-compose.yml   Local Postgres / Redis / MinIO
store/                 Play / App Store listing assets
```

### Layout (this website monorepo)

```
apps/api/              NestJS API + Prisma
src/                   Next.js website
docs/                  Deploy / security / migration docs
store/                 Android APK publish notes (website-hosted download)
scripts/publish-android-apk.sh
FULL_REPORT_MOBILE.md  This file
```

---

## 3. Auth & security (shared Nest — Aug 2026)

| Feature | Behavior |
|---------|----------|
| Sessions | HttpOnly `hel_session` cookie (website); CSRF `hel_csrf` |
| H5 | No browser-readable session token in body / `localStorage` |
| M3 Email verification | Unverified → restricted; `EMAIL_VERIFICATION_REQUIRED` |
| M4 Forced password reset | `mustResetPassword` → `PASSWORD_RESET_REQUIRED` |
| L4 Staff MFA (TOTP) | Admin/owner; challenge before full session when enabled |
| Mandatory staff MFA | `REQUIRE_STAFF_MFA=true` → restricted session until enroll (`MFA_ENROLLMENT_REQUIRED`) |
| Recovery codes | 10 hashed codes; one-time; regen invalidates old |
| Admin MFA reset | Owner can reset admin MFA via `POST /admin/users/:id/reset-mfa` (**profile id**) |
| Staff hiding | Members never see admin/owner on dating surfaces |
| Rate limits | Redis fail-closed on auth |
| CORS | Explicit `CORS_ORIGINS` (+ Capacitor origins in non-prod defaults) |

**Rollout:** keep `REQUIRE_STAFF_MFA` off until one production owner enrolls and tests TOTP + recovery.

Website UI routes: `/verify-email`, `/change-password`, `/enroll-mfa`, login MFA challenge, profile MFA card, admin reset MFA.

---

## 4. Member journey details

1. **Register** → session + email verification mail  
2. **Verify email** → then gender / questionnaire  
3. **Pay** Basic or Premium (Stripe or EVC proof)  
4. **Approval** may apply for women on Basic  
5. **Discover / Matches / Chat** — server-gated by paid + review status  

Staff go to `/admin` (website) or Capacitor `/admin` (mobile), not the member dating funnel.

---

## 5. Matching & photos

- Discover pool is **members only** (`role: "user"` + discoverable rules).  
- Compatibility soft floor and filters are server-side.  
- Photo visibility: `everyone` | `matches` | `private` (member privacy).  
- Staff viewers may see member photos for support; **members do not see staff**.  
- Unauthorized / hidden media → `null` URL + safe UI placeholder (no retry loops).

---

## 6. Payments

| Path | Notes |
|------|--------|
| Stripe Checkout | Webhook `POST /webhooks/stripe` on Nest |
| EVC / M-PESA | Upload proof → admin review → `hasPaid` |
| Pricing | Gender / tier matrix in `apps/api/src/payments/pricing.ts` |
| Fake Stripe | Local/tests only — blocked in production |

Mobile must use the **same** production Nest base URL as the website.

---

## 7. Chat & notifications

- REST + Socket.IO on the Nest host  
- Cookie / token auth on connect; M3/M4/MFA enrollment block sockets when required  
- Push notifications: **not implemented**  
- In-app notifications API exists; mobile dedicated UI may lag website  

---

## 8. Account deletion

- Website: `DELETE /profile/account` and/or `POST /auth/delete-account` (password + confirm)  
- Mobile Settings should call the Nest delete endpoint and clear secure storage  
- Required for Play Store policy  

---

## 9. Environment (production)

### Nest (Render)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres |
| `REDIS_URL` | Rate limits + queues + sockets |
| `SESSION_SECRET` | Sessions (≥32 chars) |
| `COOKIE_SECURE` / `COOKIE_SAMESITE` | `true` / `lax` for `api.helcalafkaaga.com` (same-site). Use `none` only for legacy `*.onrender.com` browser traffic. |
| `CORS_ORIGINS` | www + apex (+ Capacitor if needed) |
| `APP_URL` | Website origin for emails/links |
| `MAIL_DRIVER` / `RESEND_*` | Email |
| `STRIPE_*` | Live payments |
| `S3_*` + buckets | Media |
| `REQUIRE_STAFF_MFA` | Optional mandatory staff MFA (default off) |

### Website (Vercel)

```bash
NEXT_PUBLIC_APP_URL=https://www.helcalafkaaga.com
# Safari-safe: same-origin proxy (next.config.ts rewrites /backend → Render)
NEXT_PUBLIC_API_URL=/backend
API_UPSTREAM_URL=https://tel-calafkaaga-1.onrender.com
# SOCKET optional — defaults to page origin when API is relative
```

Upstream / rollback Nest URL (not for browser NEXT_PUBLIC_* on Safari):
`https://tel-calafkaaga-1.onrender.com`

### Mobile (Capacitor)

```bash
VITE_API_URL=https://api.helcalafkaaga.com
VITE_SOCKET_URL=https://api.helcalafkaaga.com
# Emulator → host machine API: http://10.0.2.2:4000
# Until api.* exists, native apps may call the Render URL directly (not third-party WebView cookies).
```

See `apps/api/.env.example` and `infra/staging/vercel-api-mode.env.example`.

---

## 10. Deploy checklist (finish production)

1. **Push** Nest + website to `main` (already on GitHub for recent security work).  
2. **Render** — Manual Deploy Nest; confirm `prisma migrate deploy` (incl. MFA migration).  
3. **Stripe** webhook → `https://YOUR-API/webhooks/stripe`.  
4. **Vercel** — Redeploy website after `NEXT_PUBLIC_*` set.  
5. **Smoke** — login, verify email, MFA (staff), photo, chat, payment.  
6. **Mobile** — open Capacitor repo; point `VITE_*` at production Nest; sync Android.  
7. **Play Store** — signed AAB, listing, privacy, content rating, internal test → production.

Website deploy helper: `npm run deploy:checklist`.

---

## 11. Android / Play Store build (mobile monorepo)

```bash
# In Capacitor monorepo
npm install
npm run build -w @hel/client
cd apps/client && npx cap sync android
cd android && ./gradlew bundleRelease
# → app/build/outputs/bundle/release/app-release.aab
```

Debug APK:

```bash
cd apps/client/android && ./gradlew assembleDebug
```

Website-hosted APK publish notes: `store/README.md` + `scripts/publish-android-apk.sh`  
Share URL pattern: `https://YOUR-API-HOST/download` (Nest download controller).

**Play Console still needs:** signed keystore, store listing, privacy policy URL, data safety form, screenshots, content rating, IAP decision if charging in-app.

---

## 12. Local run (API + website)

```bash
npm install
cp infra/.env.example infra/.env
# start postgres/redis/minio via compose

cp apps/api/.env.example apps/api/.env
npm run prisma:generate
npm run prisma:migrate:deploy -w @hel/api
npm run dev:api

# website
npm run dev
```

Mobile client (separate repo):

```bash
cp apps/client/.env.example apps/client/.env
npm run dev:client
```

---

## 13. Security claims (store / privacy)

| Claim | Status |
|-------|--------|
| Data on servers (Postgres + object storage) | Yes |
| Sell personal data | No |
| End-to-end encrypted chat | **No** |
| Background / government ID checks | **No** |
| Account self-deletion | Yes |
| Device push tokens | **Not implemented** |
| Staff hidden from member dating | Yes |
| CSRF + rate limits | Yes |
| Staff MFA (TOTP) | Yes (opt-in / mandatory via flag) |

Legal screens (website): `/legal/privacy`, `/legal/terms`, `/legal/guidelines`, `/legal/safety`, `/legal/help`, `/legal/about` (EN + SO).

---

## 14. Update mobile from latest website (parity checklist)

**Why this file exists:** so the Capacitor app can be updated against the **latest Nest + website security**, then verified that behavior is the **same** for members and staff.

**Repos on this machine**
| Role | Path |
|------|------|
| Latest website + Nest (source of truth) | `/home/tryhackme/Downloads/Hel-Calafkaaga` (`main`, includes M3/M4/L4) |
| Mobile Capacitor monorepo | `/home/tryhackme/TEL-CALAFKAAGA-1 app` (older Nest fork; client missing M3/M4/L4 UI) |

### What is already the same (server-side when mobile points at production Nest)

If mobile `VITE_API_URL` / `VITE_SOCKET_URL` = production Render Nest from **this** repo:

| Behavior | Same? |
|----------|-------|
| Pricing, paywall, Stripe/EVC | Yes (API) |
| Staff hidden from Discover/matches/chat | Yes (API `shouldHideProfileFromViewer`) |
| Account delete endpoint | Yes if mobile calls Nest delete |
| Email verify / forced reset / MFA gates | Yes on **API** — mobile UI may not handle 403 codes yet |

### What is NOT the same today (must fix in mobile repo)

| Area | Website (latest) | Mobile app today |
|------|------------------|------------------|
| Nest copy in mobile repo | N/A (uses this repo’s API in prod ideally) | Forked `apps/api` **missing** MFA, email-verification guard, must-reset |
| Email verification (M3) | `/verify-email` + soft redirect | **Missing** |
| Forced password reset (M4) | `/change-password` gate | Settings change-password only; **no** `PASSWORD_RESET_REQUIRED` gate |
| Staff MFA (L4) | Login challenge + `/enroll-mfa` | **Missing** |
| Soft 403 redirects | `PASSWORD_RESET_REQUIRED` → change-password, `EMAIL_VERIFICATION_REQUIRED` → verify-email, `MFA_ENROLLMENT_REQUIRED` → enroll-mfa | **Missing** |

### Recommended sync order

1. **One Nest only** — Redeploy Render from website `main`. Do **not** run the older mobile `apps/api` in production.  
2. **Point mobile** — `apps/client/.env.production`:  
   `VITE_API_URL` + `VITE_SOCKET_URL` = production Nest (e.g. `https://tel-calafkaaga-1.onrender.com`).  
3. **Port website security UI into Capacitor** (same API contracts):  
   - Handle login `mfaRequired` + `POST /auth/mfa/verify-login`  
   - Screens/routes for verify-email, forced change-password, enroll-mfa  
   - API client: on 403 codes soft-navigate like website `security-gate-codes.ts`  
4. **Smoke same flows** on phone + website: register → verify email → pay → discover (no staff) → chat → delete account; staff MFA if admin.  
5. **Rebuild** Android AAB/APK and ship Play / sideload.

### Quick verify commands

```bash
# Website Nest health (production)
curl -sS https://tel-calafkaaga-1.onrender.com/health

# Mobile production env must match that host
grep VITE_ /path/to/mobile/apps/client/.env.production
```

---

## 15. Known gaps / follow-ups

1. Confirm Render is on latest website `main` (MFA migration applied).  
2. Sync Capacitor client security UI (section 14) — open mobile workspace to implement.  
3. Stop using mobile repo’s older Nest fork in production.  
4. IAP / Play Billing decision before charging only through Google Play.  
5. Push notifications not shipped.  
6. Owner MFA enroll + recovery test before `REQUIRE_STAFF_MFA=true`.

---

## 16. One-page summary

Hel Calafkaaga **mobile** is a **Capacitor** Android/iOS app talking to the same **NestJS** API as the **Next.js** website (Postgres + Redis + S3 + Socket.IO). Members register, verify email, complete a questionnaire, and pay via Stripe or EVC. Access is server-gated. Discover hides staff. Staff can use TOTP MFA; mandatory enrollment is flag-gated. Website ships from this repo (Vercel + Render). **Play Store shipping requires the Capacitor/Android project** and a signed AAB upload to Play Console.

---

## 17. Key source files (shared Nest — this repo)

| Concern | Path |
|---------|------|
| Paid / staff access + hide staff | `apps/api/src/common/access.ts` |
| Review / discoverable | `apps/api/src/common/review-status.ts` |
| Auth + MFA | `apps/api/src/auth/` |
| Matching | `apps/api/src/matching/match.service.ts` |
| Chat realtime | `apps/api/src/chat/chat.gateway.ts` |
| Payments / EVC | `apps/api/src/payments/` |
| Account deletion | `apps/api/src/admin/deletion.service.ts` |
| Prisma schema | `apps/api/prisma/schema.prisma` |
| Website MFA UI | `src/app/(app)/enroll-mfa/`, `src/components/profile/mfa-settings-card.tsx` |
| CI / security notes | `docs/CI_SECURITY.md` |
| Deploy checklist | `scripts/deploy-checklist.mjs` |

Mobile-only (Capacitor repo): `apps/client/src/App.tsx`, `SessionProvider`, Android `com.telcalafkaaga.app`.

---

## 18. Website vs mobile routes

| Topic | Website | Mobile (Capacitor) |
|-------|---------|---------------------|
| UI | Next.js / Vercel | Capacitor Android / iOS |
| API | Same Nest | Same Nest |
| Client env | `NEXT_PUBLIC_*` | `VITE_*` |
| Home after paywall | `/dashboard` | `/home` |
| Payment | `/payment` | `/plans` |
| Gender step | `/register/details` | `/onboarding/gender` |
| MFA enroll | `/enroll-mfa` | Mirror when implemented |
| Admin | `/admin` | `/admin` |

---

*This report describes how the product and shared Nest API are designed to work for mobile and Play Store. For live counts, Stripe, Render, and store status, use production dashboards — not this file.*
