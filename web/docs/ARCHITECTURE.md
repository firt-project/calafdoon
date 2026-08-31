# Hel Calafkaaga — Full System Report

How the website works from **backend → frontend**, based on the live codebase.

Related docs:

- [`docs/admin-members.md`](./admin-members.md) — Admin Members / Review queue
- [`AGENTS.md`](../AGENTS.md) — Agent rules (Nest + Prisma + Redis + S3; no Convex)
- [`README.md`](../README.md) — Product overview & local scripts

---

## 1. What this product is

**Hel Calafkaaga** is a **halal marriage / matchmaking** web app:

1. User registers (email + password)
2. Completes profile / questionnaire
3. Pays (Stripe card **or** EVC / M-PESA proof)
4. Admin may review / approve the profile
5. User browses matches, likes, chats

Site: `https://www.helcalafkaaga.com`  
Stack rule: **Nest API + PostgreSQL (Prisma) + Redis + S3**. Frontend talks only through `src/data/**` adapters — **no Convex** at runtime.

---

## 2. High-level architecture

```
┌─────────────────────┐     HTTPS + cookies /     ┌──────────────────────┐
│  Next.js frontend   │     X-Session-Token       │  NestJS API          │
│  (src/, Vercel)     │ ───────────────────────►  │  (apps/api, Render)  │
│                     │     Socket.IO             │                      │
│  src/data/**        │ ◄───────────────────────  │  Auth, Profile,       │
│  apiClient + hooks  │                           │  Matching, Chat,     │
└─────────────────────┘                           │  Payments, Admin     │
                                                  └──────────┬───────────┘
                                                             │
                    ┌──────────────┬─────────────────────────┼──────────────┐
                    ▼              ▼                         ▼              ▼
              PostgreSQL        Redis                   S3 / R2 / MinIO   Resend
              (Prisma)       (sessions rate           (photos, chat,      (email)
                              limits, sockets,          EVC proofs)
                              BullMQ queues)
```

| Layer | Path | Deploy (typical) |
|-------|------|------------------|
| Frontend | `src/` | Vercel |
| API | `apps/api/` | Render |
| DB | `apps/api/prisma/` | Managed Postgres |
| Cache / queues | Redis | Managed Redis |
| Files | S3-compatible buckets | Cloudflare R2 / MinIO local |
| Local deps | `infra/docker-compose.yml` | Postgres 16 + Redis 7 + MinIO |

---

## 3. Monorepo layout

| Path | Role |
|------|------|
| `src/` | Next.js App Router frontend |
| `apps/api/` | NestJS API (`@hel/api`) |
| `packages/migration/` | Historical Convex → Postgres migration tools |
| `infra/` | Docker Compose, staging/deploy helpers |
| `docs/` | Runbooks + this report |
| `e2e/` | Playwright tests |
| `scripts/` | Bootstrap, Stripe/Resend, staging utilities |
| `store/` | Android / download assets |

Root scripts (examples): `npm run dev` (Next), `npm run dev:api` (Nest).

---

## 4. Frontend (Next.js)

### 4.1 Route map

**Marketing (public)**

| URL | File |
|-----|------|
| `/` | `src/app/page.tsx` |
| `/about`, `/how-it-works`, `/pricing`, `/faq`, `/contact`, `/download` | `src/app/{name}/page.tsx` |
| `/privacy`, `/terms` | same |

**Auth & onboarding** (`src/app/(app)/`)

| URL | Purpose |
|-----|---------|
| `/login`, `/register`, `/register/details` | Auth |
| `/forgot-password`, `/reset-password` | Password reset |
| `/questionnaire` | Profile questions |
| `/payment`, `/payment/success` | Paywall / checkout |
| `/account-status` | Paused / banned / appeal status |

**Member app**

| URL | Purpose |
|-----|---------|
| `/dashboard` | Home feed |
| `/matches` | Discover / swipe |
| `/likes` | Likes lists |
| `/chat` | Conversations |
| `/profile` | Own profile |
| `/notifications` | In-app notifications |

**Admin**

| URL | Purpose |
|-----|---------|
| `/admin` | Full admin dashboard (tabs) |
| `/admin/invite` | Accept staff invite |

Shell / SEO: `src/app/layout.tsx`, `src/middleware.ts` (rate shield, optional `MAINTENANCE_MODE`).

### 4.2 How the frontend calls the API

**Rule:** all domain data goes through `src/data/**` → `apiClient` → Nest. Do not call Nest URLs ad hoc from random components when an adapter exists.

| Piece | Path |
|-------|------|
| Provider lock | `src/data/provider.ts` — always `"api"` |
| HTTP client | `src/data/api-client.ts` — cookies + CSRF + optional `X-Session-Token` |
| Domains | `src/data/{auth,profile,preferences,questionnaire,photos,matching,chat,notifications,payments,support,admin,moderation}/` |
| Realtime | `src/data/realtime/socket-client.ts` |
| Barrel | `src/data/index.ts` |

**Public env (frontend):**

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_SOCKET_URL` (or falls back to API URL)
- `NEXT_PUBLIC_APP_URL`

UI components live under `src/components/**` (marketing, auth, matches, chat, payment, admin, profile, …).

### 4.3 i18n

| File | Role |
|------|------|
| `src/lib/i18n/translations/en.ts` | English |
| `src/lib/i18n/translations/so.ts` | Somali |
| `src/lib/i18n/context.tsx` | `LanguageProvider`, `t()` |
| Default locale | **`so`** (stored in `localStorage` as `calaf-locale`) |

---

## 5. Backend (NestJS)

### 5.1 Entry & modules

- Entry: `apps/api/src/main.ts` (HTTP + Socket.IO, Redis adapter when available)
- Root: `apps/api/src/app.module.ts`

| Module | Responsibility |
|--------|----------------|
| `auth/` | Register, login, session, CSRF, password reset |
| `profile/` | Profile, questionnaire, preferences, photos |
| `matching/` | Discover, likes, matches, scores |
| `chat/` | Conversations + Socket.IO gateway |
| `payments/` | Stripe + EVC proofs + grant paid access |
| `admin/` | Users, review, status history, EVC admin, moderation, support, metrics |
| `media/` | Signed upload/download URLs |
| `notifications/` | In-app notifications |
| `queue/` | BullMQ workers (scores, emails, reconcile, …) |
| `redis/` | Redis client + rate-limit guard |
| `prisma/` | DB access |
| `health/` | Health checks |
| `mail/` | Resend / console mail |
| `download/` | APK / public download endpoints |
| `config/` | Env validation (`env.validation.ts`) |

### 5.2 Database (Prisma / PostgreSQL)

Schema: `apps/api/prisma/schema.prisma`

| Model | Role |
|-------|------|
| `User` | Account (email, soft delete, activity) |
| `AuthAccount` | Password hash |
| `Session` | Server sessions (hashed tokens) |
| `Profile` | Member profile, `reviewStatus`, `hasPaid`, role, photos |
| `Preference` | Partner filters |
| `CompatibilityScore` | Pair scores |
| `Like` | like / pass / shortlist |
| `Match` | Pair + chat unlock |
| `Conversation` / `Message` | Chat |
| `PhotoReveal` | Private photo unlocks |
| `Notification` | Like / match / message alerts |
| `Payment` | Stripe checkout + fulfillment |
| `EvcPaymentProof` | Mobile-money screenshot queue |
| `MediaObject` | S3 object metadata |
| `AccountStatusHistory` | Admin pause/ban/approve audit |
| `Block` / `Report` | Moderation |
| `SupportContact` / `SupportMessage` | Support inbox |
| `StaffInvite`, `Announcement`, `AuditLog`, `SiteMetrics` | Ops |

Roles: `user` | `admin` | `owner`.

> Schema may still contain `convexId` fields from migration history. Runtime is Nest + Prisma only.

---

## 6. End-to-end member journey

```
Register → Complete details → Questionnaire → Payment
    → (optional Admin review) → Matches / Likes → Chat
```

### 6.1 Auth & session

1. `POST /auth/register` or `POST /auth/login`
2. API creates a **Session** (idle ~3h, absolute ~7d)
3. Sets cookie `hel_session` + CSRF cookie; may also return tokens for cross-origin (Vercel ↔ API)
4. Frontend sends credentials / `X-Session-Token` + `X-CSRF-Token` on mutating requests
5. Guards: auth required, profile required, paid required, admin roles
6. Rate limits via Redis on sensitive routes

Key files: `apps/api/src/auth/*`, `src/data/auth/*`.

### 6.2 Profile & questionnaire

- Profile CRUD + questionnaire completion under `apps/api/src/profile/`
- Frontend: `/questionnaire`, `/profile`, `src/data/profile|questionnaire|preferences|photos`

### 6.3 Payments

**Stripe (card — automatic)**

- `POST /payments/stripe/registration-checkout`
- `POST /payments/stripe/premium-upgrade-checkout`
- `POST /payments/stripe/verify-session`
- Webhook: `POST /webhooks/stripe`
- Unlocks access via `GrantPaidAccessService`

**EVC / M-PESA (manual proof — not a live M-PESA API)**

1. User sends money to displayed payee numbers (`src/lib/constants.ts`)
2. Uploads screenshot → S3 (`hel-evc` bucket)
3. Admin approves/rejects proof
4. Same grant-paid-access path as Stripe

UI: `src/components/payment/payment-gate.tsx`, `evc-payment-section.tsx`  
API: `apps/api/src/payments/*`

### 6.4 Matching & likes

HTTP (paid + profile required), e.g.:

- `GET /matches/discover`
- `POST /matches/:userId/action` `{ action: "like" | "pass" | "shortlist" }`
- Lists, mutual, start-chat, private photo reveal

Logic (`match.service.ts`): upsert like → notify → create/reactivate match when appropriate → compatibility scores (also queued via BullMQ).

Frontend: `/matches`, `/likes`, `src/data/matching/*`.

### 6.5 Chat (realtime)

**Socket.IO** between browser and Nest.

| Layer | Path |
|-------|------|
| Gateway | `apps/api/src/chat/chat.gateway.ts` |
| HTTP conversations | `conversation.service.ts` |
| Client | `src/data/realtime/socket-client.ts` |

Typical events: `conversation:join|leave`, `message:send`, `typing:*`, `messages:read`, server pushes `message:new`, `notification:new`, etc.

Multi-instance: Redis Socket.IO adapter. Typing TTL in Redis. Banned/paused users are blocked from interact (interaction lock).

---

## 7. Admin system

Single page: `src/app/(app)/admin/page.tsx` with tabs.

### 7.1 Members tab (two modes)

Documented in detail: [`docs/admin-members.md`](./admin-members.md)

| Mode | Purpose |
|------|---------|
| **All members** | Search name/email; newest signups first |
| **Review queue** | Period activity stats + approve/reject |

API: `GET /admin/users` → `AdminUsersService.listUsers`  
UI: `admin-members-panel.tsx`, `admin-review-queue-panel.tsx`, `admin-status-period-panel.tsx`

### 7.2 Other admin areas

| Area | What |
|------|------|
| Dashboard | Stats, needs-attention chips |
| Payments | Stripe payments + EVC proof queue |
| Reports | User reports |
| Contacts | Support inbox |
| Messages | Conversation oversight |
| Analytics | Charts / metrics |
| Audit | Staff action log |
| Staff invites | Invite admins (`/admin/invite`) |

Account status transitions (pause / ban / resume / approve / reject) live under `apps/api/src/admin/account-status*.ts` and write `AccountStatusHistory`.

---

## 8. Media (S3)

Presigned uploads/downloads via AWS SDK.

| Env | Typical bucket | Use |
|-----|----------------|-----|
| `S3_BUCKET_PROFILE` | `hel-profile` | Main photos |
| `S3_BUCKET_PROFILE_PRIVATE` | `hel-profile-private` | Private photos |
| `S3_BUCKET_CHAT` | `hel-chat` | Chat images |
| `S3_BUCKET_SUPPORT` | `hel-support` | Support files |
| `S3_BUCKET_EVC` | `hel-evc` | Payment screenshots |

Local: MinIO in `infra/docker-compose.yml`. Production often Cloudflare R2.

---

## 9. Redis

Used for:

- Rate limiting (auth / sensitive routes)
- Socket.IO multi-instance adapter
- Typing indicators
- BullMQ job queues (scores, emails, payment reconcile, announcements, metrics)
- Health checks

Config: `REDIS_URL` → `apps/api/src/redis/`

---

## 10. Security & access control (summary)

| Mechanism | Where |
|-----------|--------|
| Session cookies + optional bearer-style session header | `auth/`, `api-client.ts` |
| CSRF on mutating requests | `csrf.ts` + `X-CSRF-Token` |
| Role guards (`user` / `admin` / `owner`) | `auth.guards.ts` |
| Paid / profile completion gates | Nest guards + frontend gates (`PaymentGate`, approval gates) |
| Rate limits | Redis `RateLimitGuard` |
| Interaction lock (banned / paused) | `review-status` helpers + chat/match services |
| Email masking | Some admin payment lists still mask; members directory shows full email for staff search |

---

## 11. Deploy & environment

| Concern | Notes |
|---------|--------|
| Frontend | Vercel |
| API | Render (typical); `prisma migrate deploy && node dist/main.js` |
| Frontend env | `.env.example`, `.env.staging.example` |
| API env schema | `apps/api/src/config/env.validation.ts` |
| Auth cookies (Safari) | Prefer same-origin Vercel proxy: `NEXT_PUBLIC_API_URL=/backend` + `API_UPSTREAM_URL` → Render (`next.config.ts` rewrites). Nest: `COOKIE_SECURE=true`, `COOKIE_SAMESITE=lax`, `TRUST_PROXY=true`, `COOKIE_DOMAIN` unset, `CORS_ORIGINS` www+apex. See `infra/staging/vercel-api-mode.env.example`. Optional later: `https://api.helcalafkaaga.com`. |
| Local infra | `infra/docker-compose.yml` |
| Staging runbook | `docs/STAGING_DEPLOYMENT_RUNBOOK.md` |
| Maintenance | `MAINTENANCE_MODE` → `/maintenance.html` |
| Checklist | `npm run deploy:checklist`, `npm run preflight` |

Required API-ish secrets (examples): `DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET` / `AUTH_SECRET`, Stripe keys, S3 credentials, mail provider.

---

## 12. Cheat sheet — important paths

```
# Rules & product
AGENTS.md
README.md
src/lib/constants.ts

# Frontend
src/app/**/page.tsx
src/middleware.ts
src/components/**
src/data/api-client.ts
src/data/provider.ts
src/data/realtime/socket-client.ts
src/lib/i18n/**

# Backend
apps/api/src/main.ts
apps/api/src/app.module.ts
apps/api/src/auth/
apps/api/src/profile/
apps/api/src/matching/
apps/api/src/chat/
apps/api/src/payments/
apps/api/src/admin/
apps/api/src/media/
apps/api/src/redis/
apps/api/src/queue/
apps/api/prisma/schema.prisma

# Infra & docs
infra/docker-compose.yml
docs/admin-members.md
docs/ARCHITECTURE.md          ← this file
docs/STAGING_DEPLOYMENT_RUNBOOK.md
```

---

## 13. Accuracy notes

- **EVC / M-PESA** = payee numbers + screenshot review. There is **no** live M-PESA STK push API in this repo.
- **Convex** appears only in migration/history artifacts — not in the live frontend data provider.
- Matching: a **like** can create/reactivate a match; **mutual** means both sides liked (see `match.service.ts`).
- Admin “Women awaiting approval” (`needs_action`) is a **narrow** filter (paid basic women needing approval), not all pending users.

---

*Generated from the Hel Calafkaaga codebase. Update this file when major architecture changes land.*
