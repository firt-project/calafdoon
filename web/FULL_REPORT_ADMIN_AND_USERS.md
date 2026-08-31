# Hel Calafkaaga — Admin & Member Full Report

**Last updated:** 1 August 2026  
**Product:** Halal Muslim marriage matchmaking  
**Stack:** Next.js website (`src/`) + NestJS API (`apps/api`) + PostgreSQL (Prisma) + Redis + S3 + Socket.IO  
**Hosting:** Vercel (website) · Render (API, e.g. `https://tel-calafkaaga-1.onrender.com`)  
**There is no Convex backend.** Frontend data goes through `src/data/**` → Nest only.

---

## 1. Roles at a glance

| Role | Who | Where they land |
|------|-----|-----------------|
| `user` | Paying / registering members | `/dashboard` after onboarding |
| `admin` | Staff moderators | `/admin` |
| `owner` | Super-admin | `/admin` (extra powers) |

Staff (`admin` / `owner`) never go through questionnaire or payment. Members never see staff in Discover.

---

## 2. How members (users) work

### 2.1 Journey (server-enforced)

```
Register (email + password)
  → Choose gender (/register/details)
  → Complete questionnaire (+ photo)
  → Pay (Stripe card OR EVC / M-PESA proof)
  → Women on Basic may wait for admin profile approval
  → Home / Discover / Likes / Chat / Profile / Account status
```

### 2.2 Step-by-step

| Step | Page | What happens |
|------|------|----------------|
| Sign up | `/register` | Creates account + session |
| Gender / details | `/register/details` | Locks gender path; completes registration basics |
| Questionnaire | `/questionnaire` | Profile + preferences; sets `submittedAt` and status history `submitted` |
| Payment | `/payment` | **Card (Stripe)** unlocks immediately, no screenshot. **EVC/M-PESA** needs admin proof approval |
| Approval wait | Gated on Matches/Chat | Only **paid women on Basic** with `pending_review` / `rejected` |
| App use | `/dashboard`, `/matches`, `/likes`, `/chat`, `/profile` | Requires paid + not blocked by approval/ban/pause |
| Status timeline | `/account-status` | Shows registration, submission, approvals, bans, pauses, appeals (public messages only) |
| Notifications | `/notifications` | Likes, matches, messages, payments, approvals |

### 2.3 Access rules (what unlocks what)

| Condition | Result |
|-----------|--------|
| Not paid (`hasPaid` false) and not staff | Forced to `/payment` — no Discover/Chat |
| Paid man | Usually **approved** right after payment |
| Paid woman **Basic** | May stay `pending_review` until admin approves (unless Stripe grant force-approved) |
| Paid woman **Premium** (`hasPersonalSupport`) | Skips approval queue |
| `banned` | Cannot use the app (auth blocked) |
| `paused` | Not discoverable; matching locked until resume |
| `rejected` | Sees pending/rejection gate; can update photo and wait / appeal |

**Frontend checks:** `src/lib/access.ts`, `src/lib/review-status.ts`, `src/lib/routes.ts`  
**API checks:** `apps/api/src/common/access.ts`, `access-state.ts`, `review-status.ts`, matching `@RequirePaid`

### 2.4 Payment (member view)

- **Stripe (card):** Checkout → webhook / `verify-session` → `hasPaid: true`, chats unlocked, pending EVC proofs closed. No screenshot.
- **EVC / M-PESA:** Send money → upload proof → wait for admin Approve/Reject.
- Prices (current): Men Basic **$5**, Women Basic **$2.50**, Premium men **$20**, Women premium upgrade **$15**.

Key files:
- UI: `src/components/payment/payment-gate.tsx`, `evc-payment-section.tsx`
- API: `apps/api/src/payments/*`, especially `grant-paid-access.service.ts`

### 2.5 Member surfaces & APIs

| Feature | Frontend | Main Nest routes |
|---------|----------|------------------|
| Auth | `src/data/auth/**` | `/auth/register`, `/auth/login`, `/auth/me`, logout, password |
| Profile / questionnaire | `src/data/profile/**`, `questionnaire/**` | `/profile/*`, `/preferences/me` |
| Payments | `src/data/payments/**` | `/payments/stripe/*`, `/payments/evc/*` |
| Discover / likes | `src/data/matching/**` | `/matches/discover`, `/matches/lists`, `/matches/:id/action`, `/matches/start-chat` |
| Chat | `src/data/chat/**` | `/conversations`, messages, typing, images |
| Notifications | `src/data/notifications/**` | `/notifications` |
| Account status | `/account-status` | `GET /account-status`, `POST /account-status/appeals` |
| Safety | moderation adapters | Report / block |

### 2.6 Member key files

```
src/app/(app)/register/
src/app/(app)/questionnaire/
src/app/(app)/payment/
src/app/(app)/dashboard/
src/app/(app)/matches/
src/app/(app)/likes/
src/app/(app)/chat/
src/app/(app)/profile/
src/app/(app)/account-status/
src/app/(app)/notifications/
src/data/**                      # all Nest adapters
src/lib/access.ts
src/lib/review-status.ts
src/lib/routes.ts
```

---

## 3. How admin works (full)

### 3.1 How staff get in

1. Owner invites staff (`/admin` → Staff invites) **or** existing admin role on profile.
2. Invite accept: `/admin/invite`.
3. Login as normal → `getAuthenticatedHomeRoute` sends staff to `/admin`.

**Owner-only powers**
- Create / revoke staff invites
- Change member role (`user` ↔ `admin`) — never self-demote owner
- Rebuild site metrics

**Safety**
- Cannot ban the owner
- Cannot reject/delete staff until demoted
- Banned members cannot authenticate

### 3.2 Admin console (`/admin`)

Main file: `src/app/(app)/admin/page.tsx`  
Tabs (see `src/lib/admin-nav.ts`): dashboard · users · messages · contacts · reports · payments · announcements · analytics · audit · settings

| Tab | What admin does | Main UI components |
|-----|-----------------|--------------------|
| Dashboard | Snapshot stats (approved, pending, revenue, etc.) | Stats cards on `admin/page.tsx` |
| Users | Search/filter members; open detail; approve/reject/ban/pause/resume | `admin-members-panel.tsx`, `admin-user-detail-panel.tsx`, `admin-status-period-panel.tsx` |
| Messages | View member conversations (staff tools) | `admin-messages-inbox.*` |
| Contacts | Support inbox replies | `admin-contacts-inbox.tsx` |
| Reports | Resolve / dismiss user reports | Reports section on admin page |
| Payments | Stripe ledger + **EVC proof queue** | Payments UI + `admin-evc-payments-panel.tsx` |
| Announcements | Create / send / schedule | Announcements UI |
| Analytics | Extra charts / metrics | Analytics section |
| Audit | Append-only staff action log | Audit list |
| Settings | Owner tools (metrics rebuild, invites) | `admin-staff-invites-panel.tsx` |

Data layer: `src/data/admin/{api,hooks,types}.ts`

### 3.3 User moderation (most important admin job)

**List:** `GET /admin/users` — filters: search, role, reviewStatus, hasPaid, paymentTier  

**Detail:** `GET /admin/users/:id`  
**Activity:** messages + likes — `GET /admin/users/:id/activity`  
**Status history:** `GET /admin/users/:id/status-history` (every approve/ban/pause with times + admin name + reason)

| Action | Endpoint | Effect |
|--------|----------|--------|
| Approve | `POST .../approve` | `approved` + history event; unlocks Basic women |
| Reject | `POST .../reject` | `rejected`; public reason to member |
| Ban | `POST .../ban` | Saves **previous** status → `banned` + `suspended` |
| Unban | `POST .../unban` | Restores **exact** previous status (not auto-approve) |
| Pause | `POST .../pause` | Saves previous → `paused` |
| Resume | `POST .../resume` | Restores previous |
| Suspend / Unsuspend | `POST .../suspend`, `.../unsuspend` | Timed suspension + expiry |
| Request photo | `POST .../request-photo` | Notifies member |
| Delete | `DELETE .../:id` | Member deletion (not staff) |

**Correct restore examples (tested)**
- Approved → Banned → Unbanned = **Approved**
- Pending → Banned → Unbanned = **Pending**
- Rejected → Banned → Unbanned = **Rejected**
- Approved → Paused → Resumed = **Approved**
- Pending → Paused → Resumed = **Pending**

Engine: `apps/api/src/admin/account-status.service.ts`  
History table: `account_status_history` (append-only)  
Audit: `audit_logs` via `AuditLogService`

### 3.4 Payments (admin)

**EVC / M-PESA proofs**
- `GET /admin/evc/pending`
- `POST /admin/evc/:id/approve` → grants paid access (same grant service as Stripe)
- `POST /admin/evc/:id/reject`

**Stripe**
- List / stats / quarantine under `/admin/payments*`
- Webhooks fulfill automatically; admin mainly monitors

### 3.5 Period reports (date filters)

UI: `AdminStatusPeriodPanel` on Users tab  

API: `GET /admin/reports/status-period?preset=last_7_days&tz=Africa/Mogadishu&country=Somalia&compare=1`  

Presets: today, yesterday, last 7/30 days, this/last week, this/last month, this year, all time, custom  

Shows real DB counts for the range: registrations, approved, rejected, paused, resumed, banned, unbanned, active users, messages, reports, appeals.  
(Video/coin/gift metrics are **always 0** — this app does not have those products.)

CSV: `GET /admin/reports/status-period.csv` (also client-side CSV from panel)

Timezone: stored **UTC**; display uses admin-selected IANA timezone.

### 3.6 Other admin domains

| Domain | API prefix | Notes |
|--------|------------|-------|
| Reports | `/admin/reports` | Resolve / dismiss |
| Support | `/admin/support…` | Inbox + reply |
| Announcements | `/admin/announcements` | Send / schedule |
| Staff invites | `/admin/staff-invites` | Owner only |
| Stats / analytics / activity | `/admin/stats`, `/admin/analytics`, `/admin/activity` | Dashboard numbers |
| Site metrics | `/admin/site-metrics` | Owner can rebuild |
| Audit logs | `/admin/audit-logs` | Append-only admin actions |
| Conversations | `/admin/conversations` | Staff chat tools |

### 3.7 Admin key files

```
apps/api/src/admin/
  admin-users.controller.ts / admin-users.service.ts
  account-status.service.ts
  account-status-reports.controller.ts
  account-status-member.controller.ts
  admin-evc.controller.ts
  admin-payments.controller.ts
  moderation.controller.ts / moderation.service.ts
  support.controller.ts / support.service.ts
  announcements.controller.ts
  staff-invites.controller.ts
  admin-misc.controller.ts
  audit-log.service.ts
  metrics.service.ts
  admin-stats.service.ts
  date-range.ts
  admin.module.ts

src/app/(app)/admin/page.tsx
src/app/(app)/admin/invite/page.tsx
src/components/admin/*
src/data/admin/*
src/lib/admin-nav.ts
```

---

## 4. Account status & timestamps (shared)

Every important status change writes:

1. Profile fields (`approvedAt`, `bannedAt`, `pausedAt`, `statusBeforeBan`, …)  
2. A row in **`account_status_history`** (never overwritten)  
3. An **`audit_logs`** row for staff actions  

Members see **public** messages only (no internal admin notes).  
Admins see full history including internal notes and actor name.

Login updates `users.lastLoginAt` / `lastActiveAt`.

Migration: `apps/api/prisma/migrations/20260801010000_account_status_history/`

---

## 5. Production checklist

1. Website env: `NEXT_PUBLIC_API_URL` → Render API (not the Vercel URL).  
2. API env: `DATABASE_URL`, Redis, S3, Stripe, `CORS_ORIGINS` including `helcalafkaaga.com`.  
3. After Nest schema changes: **`prisma migrate deploy`** on Render.  
4. Health: `GET /health` and `GET /health/ready` should show DB/Redis/S3 up.

---

## 6. Quick “who does what” cheat sheet

| Goal | Actor | Where |
|------|-------|-------|
| Register and pay | Member | `/register` → questionnaire → `/payment` |
| See matches | Member (paid + approved) | `/matches` |
| Check my status timeline | Member | `/account-status` |
| Approve a woman Basic profile | Admin | `/admin` → Users → Approve |
| Review EVC screenshot | Admin | `/admin` → Payments → EVC panel |
| Ban then later unban without wrong status | Admin | Ban/Unban (history restores prior status) |
| Pause matching temporarily | Admin | User detail → Pause / Resume |
| See today’s registrations / bans | Admin | Users tab → Period activity panel |
| Invite a new admin | Owner | Staff invites |
| Read who approved whom | Admin/Owner | User status history + Audit tab |

---

## 7. Related docs in this repo

- `FULL_REPORT_MOBILE.md` — Capacitor mobile companion (same Nest API)  
- `AGENTS.md` — Nest-only backend rule for agents  
- `apps/api/src/admin/account-status.transitions.test.ts` — automated restore tests  

This file is the website monorepo handoff for **how admin works** and **how members work** end-to-end.
