# Hel Calafkaaga — Full Product & Technical Report (Mobile App)

**Audience:** Backend / platform / frontend / mobile engineers  
**Product:** Halal Muslim marriage matchmaking (**native mobile app**)  
**Last updated:** 27 July 2026  
**Marketing site:** `https://helcalafkaaga.com` / `https://www.helcalafkaaga.com`  
**Production API:** NestJS on Render (e.g. `https://tel-calafkaaga-1.onrender.com`)  
**App ID:** `com.telcalafkaaga.app` · Version `1.0.0` · Capacitor `7.x`

> This document describes the **mobile monorepo** (Capacitor / React / Vite + NestJS API + PostgreSQL).  
> It pairs with the **website** report (`FULL_REPORT.md` in the Next.js monorepo). Both clients share one Nest backend.  
> Do **not** use Convex URLs, `$10/$20` flat pricing, 7-day free trial unlock, or ≥70% discover thresholds as current truth.

**There is no Convex backend.** Legacy `convexId` / `convex_user_id` columns exist only for migration parity. Import tooling lives under `packages/migration/`.

**There is no Next.js website in the mobile repo.** Website lives in a separate monorepo; the mobile repo ships `apps/client` (Capacitor) + `apps/api` (Nest).

> **Note:** When this file lives in the **website** workspace (`Hel-Calafkaaga`), it is the companion mobile handoff. Copy it into the Capacitor monorepo as needed. Canonical filename: `FULL_REPORT_MOBILE.md`.

Related docs (mobile repo): `README.md`, `PRIVACY_DATA_MAP.md`, `ACCOUNT_DELETION.md`, `STORE_POLICY_DECISIONS.md`, `RELEASE_CHECKLIST.md`.

Canonical filename for cross-repo copy: `FULL_REPORT_MOBILE.md` (same content as this file).

---

## 1. What this product is

Hel Calafkaaga connects Muslim men and women seeking **marriage** (not casual dating).

### Member journey (server-enforced)

```
Register (email + password)
  → Choose gender
  → Complete questionnaire (+ photo)
  → Pay (Stripe card OR EVC / M-PESA proof)
  → (Women on Basic: may wait for admin profile approval)
  → Home / Discover / Matches / Chat
```

### Staff

`admin` / `owner` manage members, payments (Stripe + EVC), reports, support inbox, announcements, and invites. Staff profiles are **hidden** from member Discover / matches / chat lists.

---

## 2. Technology stack (current)

| Layer | Technology |
|--------|------------|
| Mobile app | **Capacitor 7** + React 19 + Vite + TypeScript |
| Frontend data | `@hel/api-client` → Nest REST (+ Socket.IO) |
| Backend | **NestJS** (`apps/api`) |
| Database | **PostgreSQL** via **Prisma** |
| Cache / queues / rate limits | **Redis** (+ BullMQ) |
| Object storage | S3-compatible (local MinIO; production R2/S3) |
| Realtime chat | **Socket.IO** |
| Payments | **Stripe Checkout** + **manual EVC / M-PESA** proof review |
| Email | Resend when `MAIL_DRIVER=resend` (else console / disabled) |
| Auth | Nest sessions + CSRF; mobile stores session token in **secure storage** |
| Local infra | Docker Compose: Postgres + Redis + MinIO (`infra/`) |
| Languages | Somali (default) + English |
| Hosting | **Render** (API) · native builds for Play / App Store |
| Native | Android (`apps/client/android`) · iOS (`apps/client/ios`, needs macOS) |

### Repo layout

```
apps/
  api/                 NestJS API + Prisma
  client/              Capacitor app (React + Vite)
    android/           Native Android (com.telcalafkaaga.app)
    ios/               Native iOS
packages/
  api-client/          Shared HTTP/Socket adapters
  migration/           Convex → Postgres import tooling (legacy only)
infra/
  docker-compose.yml   Local Postgres / Redis / MinIO
store/                 Play / App Store listing assets
```

**No `convex/` folder. No Next.js `src/app/` in the mobile repo.**

---

## 3. Access & routing (source of truth)

Server builds `accessState` (`apps/api/src/common/access-state.ts`).  
Mobile maps API `nextRoute` → Capacitor screens (`SessionProvider.homeRouteFromAccess`).

| Condition | API `nextRoute` | Mobile screen |
|-----------|-----------------|---------------|
| Staff (`admin` / `owner`) | `/admin` | `/admin` |
| Gender / registration incomplete | `/register/details` | `/onboarding/gender` |
| Questionnaire incomplete | `/questionnaire` | `/onboarding/questionnaire` |
| No paid access | `/payment` | `/plans` |
| Ready | `/dashboard` | `/home` |
| Banned | `/login` | `/login` |

### Paid access (`hasPaidAccess`)

**Shared website Nest (intended production rule):**

- Staff → always access  
- `hasPaid === true` → access  
- **`trialEndsAt` / free trial does NOT grant access** (legacy field only)  
- Admin **approval** controls discovery / review for some women on Basic — **separate** from paywall unlock  

Matching controllers use `@RequirePaid()` so Discover / likes / chat require server paid access.

> **Mobile API fork note:** If a mobile-only Nest fork also returns true when `approved === true` or `reviewStatus === "approved"`, confirm which code is live on Render. Align forks so website and mobile see the same paywall rule.  
> **This website monorepo** (`apps/api/src/common/access.ts`): payment or staff only — not approval-only unlock.

### Discoverability

From `apps/api/src/common/review-status.ts`:

- Not banned, not staff, questionnaire complete  
- Paid / approval rules for discovery  
- **Paid women on Basic** may need admin profile approval  
- **Premium women** (`hasPersonalSupport`) skip the basic review queue  
- **Staff (`admin` / `owner`) never appear** in member Discover / matches / chat lists  

---

## 4. Pricing (current)

Constants: `apps/api/src/payments/pricing.ts` and `apps/client/src/lib/constants.ts`.

| Plan | Amount | Notes |
|------|--------|--------|
| Men — Basic registration | **$5** one-time | Full platform after grant |
| Women — Basic registration | **$2.50** one-time | May need admin approval after pay |
| Men — Premium (personal support) | **$20** one-time | Sets `hasPersonalSupport` |
| Women — Premium / upgrade | **$15** | Premium signup or Basic → Premium |
| Basic → Premium upgrade | **$15** | Existing basic members |

**Deprecated:** 7-day free trial unlocking the app (`TRIAL_DAYS` / `trialEndsAt` are legacy only).

### Payment methods

1. **Stripe Checkout** — card; webhook + verify-session grant access  
2. **EVC Plus (Somalia) / M-PESA (Kenya)** — member uploads proof screenshot; staff approve/reject in Admin → Payments  

Access is granted only via server grant logic (idempotency keys like `stripe:{sessionId}` / `evc:{proofId}`). Client claims never unlock features.

Webhook URL: `https://<API_HOST>/webhooks/stripe` (Nest — not Convex).

**Store policy:** Play Billing / StoreKit IAP decision is still open before production store listing (`STORE_POLICY_DECISIONS.md`).

---

## 5. End-to-end member journey (mobile)

```
/welcome
  → /register or /login
  → /onboarding/gender
  → /onboarding/questionnaire   (one question per screen)
  → /plans                      (Stripe and/or EVC)
  → /home                       (dashboard feed)
      /discover                 (cards: like / pass / shortlist)
      /matches
      /messages → /chat/:id
      /profile · /settings · /legal/*
      /admin                    (staff only)
```

Forgot password: `/forgot-password` → API password-reset tokens (email when Resend configured).

Optional device feature: **biometric unlock** gate (does not replace password / Nest session).

---

## 6. Auth API (Nest)

Base path: `/auth`  
Guards: rate limit + CSRF.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/auth/register` | Create account |
| POST | `/auth/register/check-email` | Email availability |
| POST | `/auth/login` | Login |
| POST | `/auth/logout` | Logout |
| POST | `/auth/logout-all` | Revoke all sessions |
| GET | `/auth/me` | Current user + accessState + CSRF |
| POST | `/auth/register/complete` | Set gender (`male` \| `female`) |
| POST | `/auth/forgot-password` | Request reset |
| POST | `/auth/reset-password` | Apply token + new password |
| POST | `/auth/change-password` | Authenticated change |
| POST | `/auth/delete-account` | Self-delete `{ password, confirm: true }` (**mobile**; shipped) |

Health: `GET /health/live`, `GET /health/ready`

**One email = one account** (normalized email uniqueness enforced in auth).

Mobile: session token in Capacitor secure storage via `@hel/api-client` (not browser cookies alone).

> **Shared API:** Website also supports `DELETE /profile/account` `{ password }` on the website Nest deploy. Both use the same `DeletionService`. Mobile should keep `POST /auth/delete-account`. Confirm both exist on the Render deploy that serves both clients.

---

## 7. Profile & questionnaire

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/profile/me` | Own profile |
| PATCH | `/profile/me` | Update allowed fields (server strips unsafe location writes) |
| GET | `/profile/access-state` | Access flags |
| GET/PATCH | `/profile/wali` | Guardian contact |
| Preferences | `/preferences/me` | Partner filters |
| Photos | Media signed upload + profile attach | Max photos: `MAX_PROFILE_PHOTOS = 5` |
| DELETE | `/profile/account` | Website self-delete (website Nest) |
| POST | `/auth/delete-account` | Mobile self-delete (see §12) |

Mobile questionnaire UX is **one question per screen** (`OnboardingScreens.tsx`) over the same profile fields as the website.

When questionnaire completes:

- `questionnaireComplete = true`
- Review status follows `resolveReviewStatus`
- Compatibility scores recalculated (queue)
- Completing the form ≠ paid ≠ always discoverable

---

## 8. Payments API

### Stripe

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/payments/stripe/registration-checkout` | `{ tier: "basic" \| "premium" }` |
| POST | `/payments/stripe/premium-upgrade-checkout` | Upgrade |
| POST | `/payments/stripe/verify-session` | After return |
| POST | `/webhooks/stripe` | Public webhook (signature required) |
| GET | `/payments/status` | Current status |

### EVC / M-PESA

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/payments/evc/proof/sign-upload` | Signed PUT to EVC bucket |
| POST | `/payments/evc/proof/upload` | Base64 upload via API (**shipped**; JSON body up to ~12mb) |
| POST | `/payments/evc/proof/submit` | Submit proof `{ tier, payerFullName, lastFourDigits, mediaId }` |
| GET | `/payments/evc/me/latest` | Member’s latest proof |
| GET | `/payments/evc/admin/pending` | Staff pending list |
| POST | `/payments/evc/admin/:proofId/approve` | Grant access |
| POST | `/payments/evc/admin/:proofId/reject` | Reject |

Payee display: Somalia EVC + Kenya M-PESA in `apps/client/src/lib/constants.ts`.

Staff may also have `/admin/evc/*` on the website Nest deploy (same proofs).

---

## 9. Matching, likes, discover

**Min discover score:** `MIN_COMPATIBILITY_SCORE = 40`  
Engine: `apps/api/src/matching/` · Scores in `CompatibilityScore`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/matches/discover` | Opposite-gender cards |
| GET | `/matches/home-feed` | Home dashboard feed |
| GET | `/matches/lists` | Shortlist / liked-you / passed aggregates |
| GET | `/matches/mutual` | Mutual matches (`list=active\|new\|archived`) |
| POST | `/matches/:userId/action` | `like` \| `pass` \| `shortlist` |
| Mutual like | Creates `Match` + `Conversation` | Chat unlocked per paid rules |

Staff profiles are filtered out of member dating surfaces.

---

## 10. Chat & messaging

HTTP: `/conversations` (+ messages, typing, read, image upload).  
Realtime: Socket.IO gateway.

- Text + optional images  
- Blocks prevent messaging both ways  
- **Not end-to-end encrypted** — do not claim E2EE  

---

## 11. Notifications

API: `/notifications`  
In-app notification rows for like / match / message / announcement / payment / approval.  

Mobile: **no dedicated `/notifications` tab yet** — home points members to Messages / Matches.  
Device push (FCM/APNs): **not implemented** (`PRIVACY_DATA_MAP.md`).

---

## 12. Roles & safety

| Role | Access |
|------|--------|
| `user` | Onboarding → paywall → member app |
| `admin` | Admin console |
| `owner` | Admin + staff invites + elevated ops |

| Feature | Behavior |
|---------|----------|
| Block | Hide for likes/chat/discover |
| Report | Admin → Reports |
| Ban | `banned: true` — cannot use app |
| Account deletion | `POST /auth/delete-account` `{ password, confirm: true }` → `DeletionService`. Staff cannot self-delete here. |

---

## 13. Admin (mobile)

Staff UI: Capacitor `/admin/*`. Backend: `/admin/*`.

| Area | Mobile screen | Backend |
|------|---------------|---------|
| Dashboard | `/admin` | `GET /admin/stats` |
| Members | `/admin/members` | List / approve / reject / ban |
| Payments | `/admin/payments` | Stripe list + EVC approve/reject |
| Reports | `/admin/reports` | Moderation |
| Support | `/admin/messages` | Inbox |
| Announcements | `/admin/announcements` | Create / send |
| Invites (owner) | `/admin/invites` | Staff invites |

### API available; mobile UI not dedicated yet

| Endpoint | Purpose |
|----------|---------|
| `GET /admin/analytics` | Insights |
| `GET /admin/audit-logs` | Staff action log |
| `GET /admin/activity` | Recent activity |
| `GET /admin/site-metrics` | Global metrics |

---

## 14. Database (PostgreSQL / Prisma)

Schema: `apps/api/prisma/schema.prisma`

| Model | Purpose |
|-------|---------|
| `User` / `AuthAccount` / `Session` | Identity + sessions |
| `PasswordResetToken` / `AuthAuditEvent` | Auth flows |
| `Profile` | Questionnaire, role, payment flags, review, photos |
| `Preference` | Partner filters |
| `CompatibilityScore` | Pair scores |
| `Like` / `Match` / `PhotoReveal` | Dating actions |
| `Conversation` / `Message` | Chat |
| `Notification` | In-app alerts |
| `Payment` / `StripeWebhookEvent` | Stripe + grant metadata |
| `EvcPaymentProof` | Mobile-money proofs |
| `MediaObject` / `UserUpload` / `OrphanedMediaObject` | Files |
| `Announcement` / `StaffInvite` | Broadcasts / invites |
| `Block` / `Report` | Safety |
| `SupportContact` / `SupportMessage` | Support |
| `AuditLog` / `DeletionJob` | Accountability / deletion |
| `SiteMetrics` / `MigrationRun` | Ops / migration |

Many models retain `convexId` for **legacy import only**.

Migrations: `apps/api/prisma/migrations/` · deploy via `prisma migrate deploy`.

---

## 15. Object storage

| Purpose | Typical bucket |
|---------|----------------|
| Profile | `hel-profile` |
| Profile private | `hel-profile-private` |
| Chat | `hel-chat` |
| Support | `hel-support` |
| EVC proofs | `hel-evc` |

Access: signed URLs via media policy (`apps/api/src/media/access-policy.ts`).

---

## 16. Environment variables

### Mobile client (build-time, public)

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | Nest HTTPS base (**required public HTTPS** for production builds) |
| `VITE_SOCKET_URL` | Socket.IO base |
| `VITE_APP_URL` | Deep links / share |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe.js / Checkout |
| `VITE_USE_LOCAL_DEMO` | Must be `false` for store / phone-against-Render |

Production Vite builds **fail** if `VITE_API_URL` is localhost / `10.0.2.2`.

### API (`apps/api/.env`)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres |
| `REDIS_URL` | Rate limits + queues + sockets |
| `SESSION_SECRET` | Sessions (strong in prod) |
| `COOKIE_*` / `CORS_ORIGINS` / `TRUST_PROXY` | HTTP / cookies |
| `APP_URL` | Redirects / emails |
| `MAIL_DRIVER` / `RESEND_*` | Email |
| `STRIPE_*` | Payments (`fake` for local tests only; blocked in production) |
| `S3_*` + bucket names | Media |

See `apps/api/.env.example` and `apps/client/.env.example`.

Nest CORS defaults include Capacitor origins (`capacitor://localhost`, `ionic://localhost`) plus website production domains.

---

## 17. Security (must stay aligned)

| Claim | Status |
|-------|--------|
| Data on servers (Postgres + object storage) | Yes |
| Sell personal data | No |
| End-to-end encrypted chat | **No** |
| Background / government ID checks | **No** |
| Account self-deletion | Yes — Settings → Delete account |
| Device push tokens | **Not implemented** |
| Analytics SDK in app | Not by default |
| One email → one account | Yes |
| CSRF on mutating routes | Yes |
| Rate limits (Redis) | Yes |
| Staff hidden from member dating | Yes |

Legal screens in app: `/legal/privacy`, `/legal/terms`, `/legal/guidelines`, `/legal/safety`, `/legal/help`, `/legal/about` (EN + SO).

---

## 18. Local run (short)

```bash
npm install
cp infra/.env.example infra/.env
npm run infra:up

cp apps/api/.env.example apps/api/.env
npm run prisma:generate
npm run prisma:migrate:deploy -w @hel/api
npm run dev:api

cp apps/client/.env.example apps/client/.env
# Emulator → host API: VITE_API_URL=http://10.0.2.2:4000
npm run dev:client
```

Android debug APK:

```bash
npm run build -w @hel/client
cd apps/client && npx cap sync android
cd android && ./gradlew assembleDebug
# → apps/client/android/app/build/outputs/apk/debug/app-debug.apk
```

Health smoke: `npm run ops:health-smoke`

---

## 19. Known gaps / backend follow-ups

### Done on shared Nest (website monorepo → redeploy Render)

1. ~~`POST /auth/delete-account`~~ — shipped (password + `confirm: true`)  
2. ~~`POST /payments/evc/proof/upload`~~ — shipped (base64; 12mb JSON limit; `uploadProofImage`)  
3. ~~Staff hiding from Discover~~ — shipped (`role: "user"` + `isDiscoverable`)  
4. ~~Account delete alignment~~ — both `POST /auth/delete-account` and `DELETE /profile/account` on website Nest  
5. Capacitor CORS origins added for local WebView  

### Still open (product / ops)

1. **Redeploy Nest on Render** so mobile sees the new routes — **confirm which repo/commit is deployed**.  
2. Align `hasPaidAccess` between website Nest and any mobile `apps/api` fork (approval-only unlock must not diverge).  
3. Stripe webhook must hit Nest `/webhooks/stripe`.  
4. IAP decision before Play / App Store production listing.  
5. Admin analytics / audit APIs exist; mobile UI not dedicated yet.  
6. Push notifications not implemented.  
7. Dedicated in-app notifications page not shipped.  
8. Photo EXIF strip — do not claim unless verified in Nest media pipeline.  
9. Announcement audience `trial` is legacy; trial does not grant access.  
10. Same Nest API serves **website** and **mobile** — keep `CORS_ORIGINS` / `APP_URL` covering both.

---

## 20. One-page summary

Hel Calafkaaga **mobile** is a **Capacitor** app talking to a **NestJS API** on **Postgres + Redis + S3 + Socket.IO** (same API as the Next.js website). Members register, finish a questionnaire, then pay via **Stripe or EVC/M-PESA**. Access is **server-gated** (`hasPaid` / staff on shared Nest). Discover uses **≥40%** compatibility and **hides staff**. Admins moderate users, Stripe + EVC proofs, reports, and support. Free trial does **not** unlock the app. Pricing is **$5 / $2.50 / $15 / $20** by gender and tier. Members can **delete their account** from Settings (`POST /auth/delete-account`). Push is not shipped. **Redeploy Render** after Nest changes so both clients stay in sync.

---

## 21. Key source files

| Concern | Path |
|---------|------|
| Paid / staff access | `apps/api/src/common/access.ts` |
| Review / discoverable | `apps/api/src/common/review-status.ts` |
| Access routing | `apps/api/src/common/access-state.ts` |
| Pricing | `apps/api/src/payments/pricing.ts` |
| Stripe + EVC | `apps/api/src/payments/payments.controller.ts` |
| EVC base64 upload | `apps/api/src/payments/evc-payments.service.ts` → `uploadProofImage` |
| Matching | `apps/api/src/matching/match.service.ts` |
| Chat realtime | `apps/api/src/chat/chat.gateway.ts` |
| Account deletion | `apps/api/src/admin/deletion.service.ts` + `POST /auth/delete-account` |
| Prisma schema | `apps/api/prisma/schema.prisma` |
| Mobile routes | `apps/client/src/App.tsx` |
| Mobile home redirect | `apps/client/src/features/auth/SessionProvider.tsx` |
| Client constants | `apps/client/src/lib/constants.ts` |
| Shared API client | `packages/api-client/` |
| Privacy data map | `PRIVACY_DATA_MAP.md` |
| Store IAP decision | `STORE_POLICY_DECISIONS.md` |

---

## 22. How this relates to the website report

| Topic | Website repo (`FULL_REPORT.md`) | This (mobile) report |
|-------|----------------------------------|----------------------|
| UI | Next.js on Vercel | Capacitor Android / iOS |
| API | Same NestJS | Same NestJS |
| Env (client) | `NEXT_PUBLIC_*` | `VITE_*` |
| Home after paywall | `/dashboard` | `/home` |
| Payment page | `/payment` | `/plans` |
| Gender step | `/register/details` | `/onboarding/gender` |
| Account delete | `DELETE /profile/account` | `POST /auth/delete-account` |
| Admin UI | Next `/admin` | Capacitor `/admin` |

Backend engineers can treat **one Nest deployment** as source of truth for both clients.

---

*This report describes how the current mobile codebase is designed to work. For live member counts, Stripe, Render logs, and Redis/Postgres health, use production dashboards — not this file.*
