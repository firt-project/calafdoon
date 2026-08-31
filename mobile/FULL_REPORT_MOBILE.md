# Hel Calafkaaga — Full Product & Technical Report (Mobile App)

**Audience:** Backend / platform / frontend / mobile / Play Store engineers  
**Product:** Halal Muslim marriage matchmaking (**native mobile app**)  
**Last updated:** 3 August 2026  
**Marketing site:** `https://helcalafkaaga.com` / `https://www.helcalafkaaga.com`  
**Production API:** NestJS on Render (e.g. `https://tel-calafkaaga-1.onrender.com`)  
**App ID:** `com.telcalafkaaga.app` · Version `1.0.0` · Capacitor `7.x`

> Canonical filename: **`FULL_REPORT_MOBILE.md`**  
> This file is the mobile / Play Store handoff. It pairs with `FULL_REPORT.md` (website) in the Next.js monorepo.  
> Both clients share **one NestJS API**. Do **not** use Convex, free-trial unlock, or outdated pricing as current truth.

---

## 0. Important: two repos

| Repo | What it contains | Deploy |
|------|------------------|--------|
| **Website workspace** (`Hel-Calafkaaga`) | Next.js website (`src/`) + Nest API (`apps/api`) | Vercel + Render |
| **This mobile monorepo** | Capacitor client (`apps/client`) + Android/iOS + Nest API | Play / App Store + Render |

**This Capacitor monorepo** has `apps/client/`, `apps/client/android/`, and `apps/client/ios/`.  
Play Store builds run here (`npm run mobile:android:*`).

Related: `README.md`, `MOBILE_SETUP.md`, `PRIVACY_DATA_MAP.md`, `ACCOUNT_DELETION.md`, `STORE_POLICY_DECISIONS.md`, `RELEASE_CHECKLIST.md`, `store/README.md`.

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
| Mobile UI | **Capacitor 7** + React + Vite + TypeScript (`apps/client`) |
| Website UI | **Next.js** (separate website repo) on Vercel |
| Frontend data | REST + Socket.IO → Nest (`VITE_*` mobile / `NEXT_PUBLIC_*` website) |
| Backend | **NestJS** (`apps/api`) |
| Database | **PostgreSQL** via **Prisma** |
| Cache / queues / rate limits | **Redis** (+ BullMQ) |
| Object storage | S3-compatible (MinIO local; R2/S3 production) |
| Realtime chat | **Socket.IO** |
| Payments | **Stripe Checkout** + **manual EVC / M-PESA** proof review |
| Email | Resend when `MAIL_DRIVER=resend` |
| Auth | Nest sessions + CSRF; mobile stores session token in **secure storage** |
| Languages | Somali + English |
| Hosting | **Render** (API) · **Vercel** (website) · native builds for Play / App Store |

### Layout (this mobile monorepo)

```
apps/
  api/                 NestJS API + Prisma (shared product with website)
  client/              Capacitor app (React + Vite)
    android/           Native Android (com.telcalafkaaga.app)
    ios/               Native iOS (needs macOS)
packages/
  api-client/          Shared HTTP/Socket adapters
  migration/           Legacy Convex → Postgres tooling
infra/
  docker-compose.yml   Local Postgres / Redis / MinIO
store/                 Play / App Store listing assets
scripts/mobile/        One-command Android/iOS build helpers
```

---

## 3. Auth & security (shared Nest — Aug 2026)

| Feature | Behavior |
|---------|----------|
| Sessions | Nest session + CSRF; mobile uses secure storage for session token |
| H5 | No browser-readable session token in body / `localStorage` on website |
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
Mobile should mirror verify / forced reset / MFA enroll when those access gates are enforced.

---

## 4. Member journey details

1. **Register** → session + email verification mail  
2. **Verify email** → then gender / questionnaire  
3. **Pay** Basic or Premium (Stripe or EVC proof)  
4. **Approval** may apply for women on Basic  
5. **Discover / Matches / Chat** — server-gated by paid + review status  

Staff go to Capacitor `/admin` (or website `/admin`), not the member dating funnel.

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

- Nest: `DELETE /profile/account` and/or `POST /auth/delete-account` (password + confirm)  
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
| `COOKIE_SECURE` / `COOKIE_SAMESITE` | `true` / `none` for cross-site |
| `CORS_ORIGINS` | www + apex (+ Capacitor if needed) |
| `APP_URL` | Website origin for emails/links |
| `MAIL_DRIVER` / `RESEND_*` | Email |
| `STRIPE_*` | Live payments |
| `S3_*` + buckets | Media |
| `REQUIRE_STAFF_MFA` | Optional mandatory staff MFA (default off) |

### Website (Vercel)

```bash
NEXT_PUBLIC_APP_URL=https://www.helcalafkaaga.com
NEXT_PUBLIC_API_URL=https://tel-calafkaaga-1.onrender.com
NEXT_PUBLIC_SOCKET_URL=https://tel-calafkaaga-1.onrender.com
```

### Mobile (Capacitor)

```bash
VITE_API_URL=https://tel-calafkaaga-1.onrender.com
VITE_SOCKET_URL=https://tel-calafkaaga-1.onrender.com
# Emulator → host machine API: http://10.0.2.2:4000
```

See `apps/api/.env.example`, `apps/client/.env.example`, and `MOBILE_SETUP.md`.

---

## 10. Deploy checklist (finish production)

1. **Push** Nest (+ website) to `main`.  
2. **Render** — Manual Deploy Nest; confirm `prisma migrate deploy` (incl. MFA migration).  
3. **Stripe** webhook → `https://YOUR-API/webhooks/stripe`.  
4. **Vercel** — Redeploy website after `NEXT_PUBLIC_*` set.  
5. **Smoke** — login, verify email, MFA (staff), photo, chat, payment.  
6. **Mobile** — point `VITE_*` at production Nest; `npm run mobile:sync` / Android build.  
7. **Play Store** — signed AAB, listing, privacy, content rating, internal test → production.

---

## 11. Android / Play Store build (this repo)

Use **JDK 21** (or 17). System Java 25 fails (`Unsupported class file major version 69`).  
Local JDKs: `.jdks/jdk-21` (preferred), auto-used by build scripts.

```bash
# Easy path (recommended)
npm run mobile:android:debug      # debug APK
npm run mobile:android:release    # Play Store AAB (needs key.properties)
npm run mobile:sync               # web build + cap sync

# Manual equivalent
npm install
npm run build -w @hel/client
cd apps/client && npx cap sync android
cd android && ./gradlew bundleRelease
# → app/build/outputs/bundle/release/app-release.aab
```

Debug APK:

```bash
npm run mobile:android:debug
# → apps/client/android/app/build/outputs/apk/debug/app-debug.apk
```

Website-hosted APK: Nest can serve `apps/api/public/download/hel-calafkaaga.apk` at `/download`.

**Play Console still needs:** signed keystore, store listing, privacy policy URL, data safety form, screenshots, content rating, IAP decision if charging in-app.

---

## 12. Local run (API + mobile client)

```bash
npm install
cp infra/.env.example infra/.env
npm run infra:up

cp apps/api/.env.example apps/api/.env
npm run prisma:generate
npm run prisma:migrate:deploy -w @hel/api
npm run dev:api

cp apps/client/.env.example apps/client/.env
# Android emulator: VITE_API_URL=http://10.0.2.2:4000
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

Legal screens (mobile + website): privacy, terms, guidelines, safety, help, about (EN + SO).

---

## 14. Known gaps / follow-ups

1. Confirm Render is on latest `main` (MFA migration applied).  
2. Mirror website M3/M4/MFA enroll flows in Capacitor when API gates them.  
3. IAP / Play Billing decision before charging only through Google Play.  
4. Push notifications not shipped.  
5. Keep one Nest deployment for website + mobile; do not fork API logic.  
6. Owner MFA enroll + recovery test before `REQUIRE_STAFF_MFA=true`.  
7. Prefer JDK 21 for Android Gradle; avoid system Java 25.

---

## 15. One-page summary

Hel Calafkaaga **mobile** is a **Capacitor** Android/iOS app talking to the same **NestJS** API as the **Next.js** website (Postgres + Redis + S3 + Socket.IO). Members register, verify email, complete a questionnaire, and pay via Stripe or EVC. Access is server-gated. Discover hides staff. Staff can use TOTP MFA; mandatory enrollment is flag-gated. **Play Store shipping** uses this repo’s Android project and a signed AAB upload to Play Console.

---

## 16. Key source files (this repo)

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
| Mobile app shell | `apps/client/src/App.tsx` |
| Session / access routing | `apps/client/src/features/auth/SessionProvider.tsx` |
| Mobile build helpers | `scripts/mobile/build.sh` |

---

## 17. Website vs mobile routes

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
