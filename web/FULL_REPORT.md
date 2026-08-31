# Hel Calafkaaga — Full Product & Technical Report (Website)

**Audience:** Backend / platform / frontend engineers  
**Product:** Halal Muslim marriage matchmaking (**website**)  
**Last updated:** 27 July 2026  
**Live website:** `https://helcalafkaaga.com` / `https://www.helcalafkaaga.com`  
**Production API:** NestJS on Render — browser traffic via `https://api.helcalafkaaga.com` (custom domain); rollback host `https://tel-calafkaaga-1.onrender.com`

> This document describes the **website monorepo** (Next.js + NestJS API + PostgreSQL).  
> It replaces the old Convex product report. Do **not** use Convex URLs, `$10/$20` flat pricing, 7-day free trial unlock, or ≥70% discover thresholds as current truth.

**There is no Convex backend in this repo.** Legacy `convexId` / `convex_user_id` columns exist only for migration parity. Import tooling lives under `packages/migration/`.

**Mobile companion report:** [`FULL_REPORT_MOBILE.md`](./FULL_REPORT_MOBILE.md) (Capacitor). Both clients share the same Nest API.

For a deeper backend/database handoff, also see: `docs/DEVELOPER_BACKEND_DATABASE_GUIDE.md`

---

## 1. What this product is

Hel Calafkaaga connects Muslim men and women seeking **marriage** (not casual dating).

### Member journey (server-enforced)

```
Register (email + password)
  → Choose gender
  → Complete questionnaire (+ optional photo)
  → Pay (Stripe card OR EVC / M-PESA proof)
  → (Women on Basic: may wait for admin profile approval)
  → Dashboard / Discover / Matches / Chat
```

### Staff

`admin` / `owner` manage members, payments (Stripe + EVC), reports, support inbox, announcements, and invites. Staff profiles are **hidden** from member Discover / matching.

---

## 2. Technology stack (current)

| Layer | Technology |
|--------|------------|
| Website | **Next.js 16** (App Router) + React 19 + TypeScript + Tailwind + shadcn/ui |
| Frontend data | `src/data/**` adapters → Nest REST (+ Socket.IO client) |
| Backend | **NestJS** (`apps/api`) |
| Database | **PostgreSQL** via **Prisma** |
| Cache / queues / rate limits | **Redis** (+ BullMQ) |
| Object storage | S3-compatible (local MinIO; production R2/S3) |
| Realtime chat | **Socket.IO** |
| Payments | **Stripe Checkout** + **manual EVC / M-PESA** proof review |
| Email | Resend when `MAIL_DRIVER=resend` (else console) |
| Auth | Nest sessions + CSRF; cross-site uses `X-Session-Token` |
| Local infra | Docker Compose: Postgres + Redis + MinIO (`infra/`) |
| Languages | Somali + English |
| Hosting | **Vercel** (website) + **Render** (API) |

### Repo layout

```
apps/
  api/                 NestJS API + Prisma
packages/
  migration/           Convex → Postgres import tooling (legacy only)
infra/
  docker-compose.yml   Local Postgres / Redis / MinIO
src/
  app/                 Next.js App Router pages
  components/          UI
  data/                API client + hooks (Nest only)
docs/                  Runbooks + developer guides
```

**No `convex/` folder. No Capacitor mobile app in this repo.**

---

## 3. Access & routing (source of truth)

Server builds `accessState` (`apps/api/src/common/access-state.ts`).  
Website uses `nextRoute` for redirects after login / onboarding.

| Condition | API `nextRoute` | Website page |
|-----------|-----------------|--------------|
| Staff (`admin` / `owner`) | `/admin` | `/admin` |
| Gender / registration incomplete | `/register/details` | `/register/details` |
| Questionnaire incomplete | `/questionnaire` | `/questionnaire` |
| No paid access | `/payment` | `/payment` |
| Ready | `/dashboard` | `/dashboard` |
| Banned | `/login` | `/login` |

### Paid access (`hasPaidAccess`)

From `apps/api/src/common/access.ts`:

- Staff → always access  
- `hasPaid === true` → access  
- **`trialEndsAt` / free trial does NOT grant access** (legacy field only)

Matching controllers use `@RequirePaid()` so Discover / likes require server paid access.

### Discoverability

From `apps/api/src/common/review-status.ts`:

- Not banned, not staff, questionnaire complete  
- Paid / approval rules for discovery  
- **Staff (`admin` / `owner`) never appear** in member Discover  

---

## 4. Pricing (current)

Constants: `apps/api/src/payments/pricing.ts` and `src/lib/constants.ts`.

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
2. **EVC Plus (Somalia) / M-PESA (Kenya)** — member uploads proof; staff approve/reject in Admin  

Access is granted only via server grant logic (idempotency keys like `stripe:{sessionId}` / `evc:{proofId}`). Client claims never unlock features.

Webhook URL: `https://<API_HOST>/webhooks/stripe` (Nest — not Convex).

---

## 5. End-to-end member journey (website)

```
Marketing (/)
  → /register or /login
  → /register/details          (gender)
  → /questionnaire
  → /payment                   (Stripe and/or EVC)
  → /dashboard
      /matches                 (Discover grid / swipe)
      /chat (conversations)
      /profile                 (edit, privacy, delete account)
      /admin                   (staff only)
```

Forgot password: `/forgot-password` → API password-reset tokens (email when Resend configured).

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
| POST | `/auth/register/complete` | Set gender |
| POST | `/auth/forgot-password` | Request reset |
| POST | `/auth/reset-password` | Apply token + new password |
| POST | `/auth/change-password` | Authenticated change |

Health: `GET /health`, `GET /health/live`, `GET /health/ready`

**One email = one account** (normalized email uniqueness enforced in auth).

---

## 7. Profile & questionnaire

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/profile/me` | Own profile |
| PATCH | `/profile/me` | Update allowed fields |
| GET | `/profile/access-state` | Access flags |
| POST | `/profile/questionnaire/*` | Autosave / complete / edits |
| GET/PATCH | `/profile/wali` | Guardian contact |
| Preferences | `/preferences/me` | Partner filters |
| Photos | `/profile/photos/*` | Sign upload, confirm, delete, reorder |
| DELETE | `/profile/account` | **Self-delete** `{ password }` |

Profile photo is **optional** for questionnaire completion.

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

Proof sign-upload + submit; staff approve/reject under `/admin/evc`.  
Payee display: Somalia EVC + Kenya M-PESA in `src/lib/constants.ts`.

---

## 9. Matching, likes, discover

**Min discover score:** `MIN_COMPATIBILITY_SCORE = 40`  
Engine: `apps/api/src/matching/` · Scores in `CompatibilityScore`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/matches/discover` | Opposite-gender cards |
| GET | `/matches/home-feed` | Dashboard feed |
| GET | `/matches/lists` | Shortlist / liked-you / etc. |
| POST | `/matches/:userId/action` | `like` \| `pass` \| `shortlist` |
| GET | `/matches/:userId/breakdown` | Score breakdown |
| Mutual like | Creates `Match` + `Conversation` | Chat unlocked per rules |

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
Website surfaces reminders; device push (FCM/APNs) is **not** the primary product path in this repo.

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
| Account deletion | `DELETE /profile/account` → `DeletionService` (password required). Staff cannot self-delete here. |

---

## 13. Admin (website)

Staff UI: `/admin` (Next.js). Backend: `/admin/*`.

| Area | Backend |
|------|---------|
| Members | List / approve / reject / ban / delete |
| Payments | Stripe list + EVC approve/reject |
| Reports | Moderation |
| Support | Inbox |
| Announcements | Create / send / schedule |
| Invites (owner) | Staff invites |
| Stats / metrics / audit | Dashboard + logs |

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

Migrations: `apps/api/prisma/migrations/` · deploy via `prisma migrate deploy` (also on API `start:prod`).

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

### Website (`.env.local`)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_API_URL` | Nest HTTPS base |
| `NEXT_PUBLIC_SOCKET_URL` | Socket.IO base |
| `NEXT_PUBLIC_APP_URL` | Public site URL |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe.js |

### API (`apps/api/.env`)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres |
| `REDIS_URL` | Rate limits + queues + sockets |
| `SESSION_SECRET` | Sessions (strong in prod) |
| `COOKIE_*` / `CORS_ORIGINS` / `TRUST_PROXY` | HTTP / cookies |
| `APP_URL` | Redirects / emails |
| `MAIL_DRIVER` / `RESEND_*` | Email |
| `STRIPE_*` | Payments (`fake` for local tests only) |
| `S3_*` + bucket names | Media |

See `apps/api/.env.example` and `.env.example`.

---

## 17. Security (must stay aligned)

| Claim | Status |
|-------|--------|
| Data on servers (Postgres + object storage) | Yes |
| Sell personal data | No |
| End-to-end encrypted chat | **No** |
| Account self-deletion | Yes — Profile → Account |
| One email → one account | Yes |
| CSRF on mutating routes | Yes |
| Rate limits (Redis) | Yes |

---

## 18. Local run (short)

```bash
npm install
cp infra/.env.example infra/.env   # set passwords
docker compose -f infra/docker-compose.yml up -d postgres redis minio minio-init

cp apps/api/.env.example apps/api/.env
npm run prisma:generate -w @hel/api
npm run prisma:migrate:dev -w @hel/api

# Terminal 1
npm run dev:api

# Terminal 2
cp .env.example .env.local
# NEXT_PUBLIC_API_URL=http://127.0.0.1:4000
# NEXT_PUBLIC_SOCKET_URL=http://127.0.0.1:4000
npm run dev
```

Optional: `npm run bootstrap:admin`

---

## 19. One-page summary

Hel Calafkaaga website is **Next.js** talking to a **NestJS API** on **Postgres + Redis + S3 + Socket.IO**. Members register, finish a questionnaire, then pay via **Stripe or EVC/M-PESA**. Access is **server-gated** (`hasPaid` / staff). Discover uses **≥40%** compatibility and **hides staff**. Admins moderate users, payments, reports, and support. Free trial does **not** unlock the app. Pricing is **$5 / $2.50 / $15 / $20** by gender and tier. Members can **delete their account** from profile settings.

---

## 20. Key source files

| Concern | Path |
|---------|------|
| Paid / staff access | `apps/api/src/common/access.ts` |
| Review / discoverable | `apps/api/src/common/review-status.ts` |
| Access routing | `apps/api/src/common/access-state.ts` |
| Pricing | `apps/api/src/payments/pricing.ts` |
| Matching | `apps/api/src/matching/match.service.ts` |
| Chat realtime | `apps/api/src/chat/chat.gateway.ts` |
| Account deletion | `apps/api/src/admin/deletion.service.ts` + `DELETE /profile/account` |
| Prisma schema | `apps/api/prisma/schema.prisma` |
| Frontend API client | `src/data/api-client.ts` |
| Deeper backend guide | `docs/DEVELOPER_BACKEND_DATABASE_GUIDE.md` |
| Mobile companion report | `FULL_REPORT_MOBILE.md` |

---

## 21. How this relates to the mobile report

| Topic | This website repo | Mobile repo (`FULL_REPORT_MOBILE.md`) |
|-------|-------------------|--------------------------------------|
| UI | Next.js on Vercel | Capacitor Android / iOS |
| API | Same NestJS | Same NestJS |
| Env (client) | `NEXT_PUBLIC_*` | `VITE_*` |
| Home after paywall | `/dashboard` | `/home` |
| Payment page | `/payment` | `/plans` |
| Account delete | `DELETE /profile/account` **and** `POST /auth/delete-account` | `POST /auth/delete-account` |

Backend engineers can treat **one Nest deployment** as source of truth for both clients.

---

*This report describes how the current website codebase is designed to work. For live member counts, Stripe, Render logs, and Redis/Postgres health, use production dashboards — not this file.*
