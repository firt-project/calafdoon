# Admin Platform Plan — Hel Calafkaaga

> **Revised plan (use this for approvals):** [`docs/admin-platform-plan-revised.md`](./admin-platform-plan-revised.md)  
> This file keeps the original Phase A audit evidence. Implementation sequencing and the **final transition matrix** live in the revised doc.  
> **Do not start Phase D until the revised plan is approved.**

**Phases A–C only.** No implementation in this document.  
**Date:** 2026-08-01  
**Constraint:** Keep Members modes **All members** and **Review queue** separate. Do not merge or stack. Do not introduce Convex.

**Evidence sources inspected:**

- `src/app/(app)/admin/page.tsx`
- `src/components/admin/admin-members-panel.tsx`
- `src/components/admin/admin-review-queue-panel.tsx`
- `src/components/admin/admin-status-period-panel.tsx`
- `src/components/admin/admin-user-detail-panel.tsx`
- `src/data/admin/{api,hooks,types}.ts`
- `apps/api/src/admin/admin-users.{controller,service}.ts`
- `apps/api/src/admin/admin-user-date-filter.ts`
- `apps/api/src/admin/account-status.service.ts`
- `apps/api/src/admin/account-status-{member,reports}.controller.ts`
- `apps/api/src/admin/audit-log.service.ts`
- `apps/api/prisma/schema.prisma`
- Payment grant / EVC paths, auth guards, notification model, admin tests

---

## PHASE A — OUTPUT 1: Current system audit

| Feature | Existing implementation | Frontend | Backend | DB model | Status | Problems | Recommended action |
|--------|-------------------------|----------|---------|----------|--------|----------|-------------------|
| Member search | Debounced 300ms; name/email/phone/city/country/id; ignores filters while searching | `admin-members-panel.tsx`, `page.tsx` | `listUsers` search OR | `Profile`, `User` | Complete | Partial ID works via startsWith; still no city-only dedicated filter chip | Preserve; extend filters carefully |
| Member filters | Status / role / payment when search empty | `admin-members-panel.tsx` | `listUsers` | Profile fields | Partially complete | No gender, date range, last-active, assigned reviewer, saved views | Phase 2–3 enhancements |
| Newest-first sort | `sortBy=registered&sortOrder=desc` | `page.tsx` | `listUsers` orderBy | `User.createdAt` | Complete | Load-more cursor still keyed on `id` (can skip/dup under non-id sorts) | P1 fix keyset pagination |
| Review queue | Tabs + advanced + drilldown + search | `admin-review-queue-panel.tsx` | `listUsers` + date filter | Profile + history | Complete | No Resubmitted / Assigned-to-me dedicated tabs (advanced has reviewer filter) | Add tabs; preserve rest |
| Period activity | Clickable metrics → drilldown | `admin-status-period-panel.tsx` | `status-period` report | History + counts | Complete | Appeals/Messages/Reports metrics not drillable | Wire drilldowns or hide click affordance |
| Approve | Transition + notify + assign self | Queue, members, detail | `approveUser` → `transition(approve)` | Profile, history, audit, Notification | Complete | Bulk approve only; no version column (uses `expectedUpdatedAt`) | Preserve; harden concurrency |
| Reject | Form with reason/public/internal/resubmit/photo | Queue (+ confirm on members) | `rejectUser` | Profile, history, audit | Partially complete | Reason presets are UI strings, not codes; members reject is thin confirm | Structured reason codes |
| Request changes | Separate form + status | Queue only | `requestChanges` | Profile fields + history | Partially complete | Not in members/detail; no required-fields array; deadline optional | Surface in detail; structured payload |
| Pause / resume | Detail + queue (approved) | Detail, queue | `pauseUser`/`resumeUser` | `statusBeforePause`, history | Complete | **No member notification** on pause/resume | Add notifications |
| Suspend / unsuspend | API exists | **No dedicated UI** in members/queue | `suspendUser`/`unsuspendUser` | `suspensionExpiresAt`, history | Partially complete | UI gap; timed suspend hard to operate | Add UI + notify |
| Ban / unban | Members, queue, detail, reports | Multiple | `banUser` | `banned`, `statusBeforeBan` | Complete | Ban → `reviewStatus=suspended` (naming confusion); **no notify** | Clarify labels; notify |
| Delete / restore | Soft delete via DeletionService | Members delete | `deleteUser` | User soft-delete + audit | Partially complete | Restore event type exists in enum/reports; **admin restore UI/API unclear/missing** | Verify restore path; add if missing |
| Review assignment | Assign to me | Queue | `assignReviewer` | `assignedReviewerId/At` | Partially complete | No reassign/release UI (API may support); no `reviewPriority` | Complete ownership UX |
| Review priority | — | — | — | **Missing column** | Missing | Cannot sort by urgency beyond waiting time | Add `reviewPriority` |
| Conflict prevention | `expectedUpdatedAt` vs `updatedAt` | Partial (not all UIs pass it) | `assertFreshProfile` | `updatedAt` | Partially complete | No `recordVersion`; stale overwrite risk if UI omits expected | Require expected on all decisions; optional version |
| Status history | Timeline in detail | Detail panel | history APIs | `AccountStatusHistory` | Complete | Member-visible vs internal notes filtering must stay correct | Preserve |
| Audit logs | Append-only list | Audit tab | `AuditLogService` | `AuditLog` | Partially complete | Not all sensitive reads logged; IP/session/correlation incomplete | Expand matrix |
| Notifications | Approve/reject/changes/photo/payment | Member app | Admin notify helpers | `Notification` | Partially complete | No delivery attempt/success/fail/retry model; ban/pause silent | Delivery tracking + missing types |
| Appeals | Member submit + period count | Member `account-status` | Member POST appeal | `AccountAppeal` | Partially complete | **No admin review API/UI**; banned users may be blocked by AuthGuard | Admin appeals queue + auth exception |
| Payments (Stripe) | List completed; webhooks | Payments tab | payments module | `Payment` | Complete | Quarantine/stats APIs underused in UI | Surface quarantine |
| Payments (EVC) | Approve/reject pending proofs | `admin-evc-payments-panel.tsx` | `evc-payments.service` | `EvcPaymentProof` | Complete | Double-approve test is weak scaffolding | Strengthen idempotency tests |
| Reports | Resolve/dismiss/ban | Reports tab inline | moderation | `Report` | Partially complete | No assign/SLA/filters | Improve Safety tab |
| Support | Inbox reply/close | Contacts tab | support service | Support models | Partially complete | No SLA; limited ops metrics | Incremental |
| Staff permissions | `user`/`admin`/`owner` only | Role checks | `@Roles` | `UserRole` | Partially complete | No granular permissions; all admins equal | Permission matrix Phase 3 |
| Staff sessions | Session model exists | — | auth sessions | `Session` | Partially complete | No staff session inspector / force logout UI | Phase 3 |
| Sensitive-data access | Detail shows phone/email/messages | Detail, messages | conversations admin | Message etc. | Unsafe / Partial | Message inspect not reason-logged; exports lightly controlled | Access reasons + audit |
| Exports | Queue CSV; period CSV | Queue, period | Client-side CSV | — | Partially complete | No permission gate; no audit of export | `exports.create` + audit |
| System health | `/health` API exists | **No admin UI** | `health.controller` | — | Partially complete | Ops page missing | Phase 4 Command/System |
| Command Center | — | — | — | — | Missing | Dashboard is stats, not actionable work queue | Phase 4 |
| Saved views | — | — | — | — | Missing | — | Phase 2 |
| Reason code config | Hardcoded UI presets | Queue forms | — | — | Missing | Display text in UI logic | Configurable definitions |

---

## PHASE A — OUTPUT 2: Workflow map

Legend: **Known** = verified in code. **Unknown** = not fully traced; do not invent.

### 1. New member registration

| Step | Detail |
|------|--------|
| Trigger | `POST /auth/register` |
| Current status | Profile created (`incomplete` / defaults); name often placeholder `"User"` until details |
| Actions | Complete details, questionnaire, pay |
| Result | User + Profile + AuthAccount |
| DB | `User`, `AuthAccount`, `Profile` |
| History | May include `registered` via status paths — **confirm all signup paths write it** (Unknown if every path calls `mark` helpers) |
| Audit | Typically none for self-register |
| Notification | None to admin by default |
| Failures | Duplicate email, rate limit, validation |

### 2. Profile submission

| Step | Detail |
|------|--------|
| Trigger | Questionnaire/payment completion paths calling submit helpers |
| Status | → `pending_review` when submission rules met (esp. paid basic women) |
| DB | `submittedAt`, `reviewStatus` |
| History | `submitted` via `markSubmitted` (**Known** when that helper runs) |
| Notification | Not systematically to all admins (**Unknown** fan-out) |
| Failures | Incomplete questionnaire; unpaid |

### 3. Payment

| Step | Detail |
|------|--------|
| Trigger | Stripe checkout/webhook **or** EVC proof approve |
| Status | `hasPaid` / premium flags; may auto-approve or leave `pending_review` |
| DB | `Payment` (+ `fulfillmentKey` unique); EVC `EvcPaymentProof` |
| History | Status changes if grant forces approval |
| Audit | EVC approve writes audit; Stripe via grant path |
| Notification | `payment` type on grant |
| Failures | Webhook miss, duplicate session, proof reject |

### 4. Profile approval

| Step | Detail |
|------|--------|
| Trigger | Admin Approve |
| From | `pending_review` / `rejected` / `changes_requested` (UI allows several) |
| To | `approved`, `approved=true` |
| DB + history | `approved` event |
| Audit | `USER_APPROVED` |
| Notification | Member approval + email (**Known**) |
| Failures | Stale `expectedUpdatedAt`; forbidden staff target |

### 5. Profile rejection

| Step | Detail |
|------|--------|
| Trigger | Admin Reject |
| To | `rejected`, `approved=false` |
| History / audit | `rejected` / `USER_REJECTED` |
| Notification | Member (**Known**) |
| Failures | Missing reason; concurrency |

### 6. Changes requested

| Step | Detail |
|------|--------|
| Trigger | Request changes form |
| To | `changes_requested` |
| DB | `changesRequestedAt`, deadline, instructions fields |
| History / audit | `changes_requested` |
| Notification | Member (**Known**) |
| Failures | Empty instructions |

### 7. Resubmission

| Step | Detail |
|------|--------|
| Trigger | Member resubmit after changes |
| To | `pending_review` (`resubmitted` event) |
| Notification | Assigned reviewer (**Known** in member controller) |
| Failures | Resubmit not allowed; banned |

### 8. Pause and resume

| Step | Detail |
|------|--------|
| Trigger | Admin pause/resume |
| To | `paused` ↔ prior via `statusBeforePause` |
| History / audit | `paused` / `resumed` |
| Notification | **Missing** |
| Failures | Wrong restore target if status corrupted |

### 9. Ban and unban

| Step | Detail |
|------|--------|
| Trigger | Admin ban/unban |
| Effect | `banned=true`, `reviewStatus=suspended`, restore via `statusBeforeBan` |
| History / audit | `banned` / `unbanned` |
| Notification | **Missing** |
| Failures | AuthGuard blocks banned user APIs (appeals risk) |

### 10. Appeal

| Step | Detail |
|------|--------|
| Trigger | Member `POST /account-status/appeals` |
| Status | Appeal `pending` |
| History | `appeal_submitted` |
| Admin decision | **Missing API/UI** (`appeal_reviewed` unused in practice) |
| Failures | Banned cannot authenticate to submit (**Known risk**) |

### 11. Support request

| Step | Detail |
|------|--------|
| Trigger | Public/contact form → SupportContact |
| Admin | Reply / mark reviewed / closed |
| Audit | Support actions audited |
| Notification | Email reply when configured |
| Failures | Mail failure (**Unknown** retry UX) |

### 12. Payment-proof review (EVC/M-PESA)

| Step | Detail |
|------|--------|
| Trigger | User submits proof |
| Admin | Approve → payment + `grantPaidAccess` / Reject + reason |
| Idempotency | Non-pending proof rejected; fulfillmentKey unique |
| Audit | `evc_payment_approved` |
| Failures | Double-click race — needs stronger test coverage |

---

## PHASE B — OUTPUT 3: Gap analysis (vs 2026 ops admin)

| Area | Gap | Class |
|------|-----|-------|
| Appeals | No admin decision path; banned users may be unable to appeal | **P0** |
| Notifications | Ban/pause/suspend silent to member | **P0** |
| AuthZ | All admins share same power; no deny-by-default capabilities | **P1** |
| Conflict safety | `expectedUpdatedAt` not enforced from every UI action | **P1** |
| Payment tests | EVC double-approve not fully proven in tests | **P1** |
| Naming | Ban uses `reviewStatus=suspended` — staff confusion | **P1** |
| Cursor pagination | `id` cursor vs `registered` sort mismatch | **P1** |
| Sensitive access | Message inspection without access-reason audit | **P1** |
| Exports | CSV without permission/audit | **P1** |
| Reject reasons | Hardcoded display strings | **P2** |
| Review ownership | No reassign/release/priority | **P2** |
| Suspend UI | API without usable UI | **P2** |
| Period drilldowns | Appeals/reports/messages not openable | **P2** |
| Delivery tracking | No notification attempt log/retry | **P2** |
| Command Center | Dashboard not actionable workboard | **P3** |
| Saved views | Missing | **P3** |
| System health UI | `/health` exists, no admin page | **P3** |
| Granular restrictions | Messaging/matching flags beyond ban/pause | **P3** |
| Staff session console | Missing | **P3** |

### Operational clarity
Two modes help, but Dashboard ≠ Command Center; Appeals invisible to staff.

### Security / privacy
Role triad only; message/PII access lightly audited; exports ungated.

### Accessibility
Forms exist; sticky decision footers / keyboard ops incomplete — **Partial**.

### Staff productivity
Assign-to-me exists; no priority, saved views, bulk reject UI, Command Center.

### Auditability
Strong for status transitions; weak for reads/exports/failed privileged attempts.

### Conflict safety
Backend support present; UI consistency incomplete.

### Error recovery
Health API exists; no owner recovery console.

### Reporting accuracy
History-based period report is solid; snapshot vs event separation already intentional — preserve.

### Notification reliability
Create-on-write for some events; no delivery ledger.

### Payment safety
Idempotent keys exist; harden tests and quarantine visibility.

---

## PHASE C — Planning deliverables

### 4. Priority list (implementation order)

**Phase 1 — P0/P1 correctness (no IA redesign)**  
1. Appeals: admin review API + UI; allow appeal submit for banned (scoped auth exception)  
2. Notify on ban/unban/pause/resume/suspend/unsuspend  
3. Enforce `expectedUpdatedAt` on all decision UIs  
4. Strengthen EVC/Stripe idempotency tests  
5. Fix list cursor for registered sort  
6. Audit exports + message inspect  
7. Clarify ban vs suspended labels in UI  

**Phase 2 — Review productivity**  
Ownership reassign/release, priority, request-changes in detail, reason codes, saved views, notification delivery rows, Resubmitted tab  

**Phase 3 — Permissions & restrictions**  
Capability matrix, staff sessions, sensitive-data reasons, finer restrictions  

**Phase 4 — Ops surfaces**  
Command Center, System health UI, config toggles, advanced analytics  

### 5. Final navigation map

Keep single `/admin` app; refine tabs (do not explode pages):

1. **Command Center** (evolve Dashboard) — actionable cards only  
2. **Members** — submodes: **All members** | **Review queue** (unchanged split)  
3. **Payments** — Stripe + EVC + quarantine  
4. **Safety & Reports** — reports queue  
5. **Appeals** — new focused queue (or Safety sub-tab)  
6. **Support** — contacts (existing)  
7. **Analytics** — existing  
8. **Staff & Audit** — invites + audit (+ future permissions)  
9. **System** — health/config (owner)  

Detail drawers remain primary for member decisions.

### 6. Database migration plan (proposed — not applied)

| Change | Purpose | Phase |
|--------|---------|-------|
| Optional `Profile.recordVersion Int @default(0)` | Stronger concurrency | 1–2 |
| `Profile.reviewPriority` enum/int | Queue sorting | 2 |
| `RejectionReason` / `ChangeRequestReason` tables or config JSON | Codes not strings | 2 |
| `NotificationDelivery` (attempt, status, error, channel) | Reliability | 2 |
| `AdminPermission` / role-permission join **or** bitflags on Profile | Granular authZ | 3 |
| `DataAccessLog` | Sensitive read audit | 3 |
| `AccountRestriction` flags table | Fine-grained locks | 3 |
| Appeals: ensure admin fields (reviewerId, decisionReason, decidedAt) | Completeness | 1 |

**Rule:** no `ReviewStatus` enum renames without migration + transition plan. Prefer UI label fixes first for ban/suspended confusion.

### 7. API change plan

| Endpoint / change | Phase |
|-------------------|-------|
| `GET/POST /admin/appeals`, `POST /admin/appeals/:id/decide` | 1 |
| Scoped auth for banned appeal submit | 1 |
| Require `expectedUpdatedAt` on approve/reject/pause/ban/… | 1 |
| `GET /admin/users` keyset cursor by sort field | 1 |
| Notify hooks on restriction transitions | 1 |
| `assignReviewer` reassign/release already partial — expose consistently | 2 |
| Reason-code endpoints / config | 2 |
| `GET /admin/notifications/failed` + retry | 2 |
| Permission checks on every admin route | 3 |
| `GET /admin/system/health` (wrap existing) | 4 |

Preserve: `GET /admin/users` search semantics; period report; EVC approve/reject.

### 8. UI component plan

| Component | Action |
|-----------|--------|
| `admin-members-panel` | Preserve; add filters gradually; pass `expectedUpdatedAt` |
| `admin-review-queue-panel` | Preserve tabs; add Resubmitted / Assigned to me / Over SLA chips |
| `admin-status-period-panel` | Preserve; finish drilldowns |
| `admin-user-detail-panel` | Sticky footer; request-changes; conflict warning |
| **New** `admin-appeals-panel` | Phase 1 |
| **New** `admin-command-center` | Phase 4 (replace decorative dashboard cards) |
| **New** `admin-system-health-panel` | Phase 4 |
| Avoid | Duplicate member lists; second review queue |

### 9. Permission matrix (target)

| Permission | Admin default | Owner |
|------------|---------------|-------|
| `members.view` | ✓ | ✓ |
| `members.approve` / `reject` / `pause` | ✓ | ✓ |
| `members.ban` / `delete` | ✓ (review) | ✓ |
| `payments.view` / `approve` / `reject` | ✓ | ✓ |
| `payments.refund` | ✗ | ✓ |
| `reports.*` / `support.manage` | ✓ | ✓ |
| `messages.inspect` | ✓ + reason | ✓ |
| `audit.view` | ✓ | ✓ |
| `exports.create` | limited | ✓ |
| `staff.manage` / `settings.manage` | ✗ | ✓ |

Enforce in Nest; UI only hides.

### 10. Status-transition matrix (current Known)

| From \ Action | approve | reject | request_changes | pause | resume | ban | unban | suspend | unsuspend | resubmit |
|---------------|---------|--------|-----------------|-------|--------|-----|-------|---------|-----------|----------|
| incomplete | * | * | * | * | — | ✓ | — | * | — | — |
| pending_review | ✓ | ✓ | ✓ | * | — | ✓ | — | * | — | — |
| changes_requested | ✓ | ✓ | ✓ | * | — | ✓ | — | * | — | ✓ |
| approved | — | * | * | ✓ | — | ✓ | — | ✓ | — | — |
| rejected | ✓ | — | ✓ | * | — | ✓ | — | * | — | * |
| paused | — | — | — | — | ✓ | ✓ | — | * | — | — |
| suspended (+ banned flag) | — | — | — | — | — | — | ✓ | — | ✓ | — |

\* = depends on service validation / UI exposure — **verify before expanding**.  
Ban sets `banned` + status `suspended`; unban restores `statusBeforeBan`.

### 11. Audit-event matrix (current + gaps)

| Event | Today | Gap |
|-------|-------|-----|
| USER_APPROVED/REJECTED/… | ✓ | — |
| REVIEWER_ASSIGNED | ✓ | reassign/release |
| EVC approve | ✓ | reject audit consistency check |
| delete_user, set_role, invites, announcements, reports, support | ✓ | — |
| Message inspect | ✗ | Add |
| Export download | ✗ | Add |
| Failed privileged action | Partial | Standardize |
| Appeal decided | ✗ | Add with admin appeals |
| Permission change | ✗ | Phase 3 |

Target fields: actor, role, action, target, before/after, reason, UTC time, IP, session, correlationId.

### 12. Notification-event matrix

| Action | In-app today | Email today | Delivery ledger |
|--------|--------------|-------------|-----------------|
| Approved | ✓ | ✓ | ✗ |
| Rejected | ✓ | ✓ | ✗ |
| Changes requested | ✓ | ✓ | ✗ |
| Photo requested | ✓ | ✓ | ✗ |
| Payment granted | ✓ | ? | ✗ |
| Paused/Resumed | ✗ | ✗ | ✗ |
| Banned/Unbanned | ✗ | ✗ | ✗ |
| Suspended/Unsuspended | ✗ | ✗ | ✗ |
| Appeal updated | ✗ | ✗ | ✗ |
| Payment proof rejected | Partial | Partial | ✗ |

### 13. Automated test plan

| Area | Tests to add |
|------|----------------|
| Appeals | Member submit while banned; admin decide; history `appeal_reviewed` |
| Concurrency | Stale `expectedUpdatedAt` → 409 |
| EVC | Double approve same proof → one grant |
| Notifications | Ban/pause create notification rows |
| listUsers | Search ignores filters; registered cursor correctness |
| Permissions | Phase 3 deny-by-default |
| Period report | Snapshot vs event metric definitions |
| Restore | Ban→unban returns prior status (already partially covered) |

Existing: `admin.test.ts`, `admin.e2e.test.ts`, `account-status.transitions.test.ts`, date-filter unit tests — **keep**.

### 14. Rollback plan

- Feature flags for new UI tabs (Appeals, Command Center)  
- Migrations expandable/backward-compatible (additive columns first)  
- Do not remove existing status values  
- Deploy API before UI that depends on new fields  
- Revert UI alone if API additive  

### 15. Risks and unknowns

| Risk / unknown | Impact |
|----------------|--------|
| Banned AuthGuard vs appeal submit | P0 product/legal |
| Whether every registration writes `registered` history | Report undercount |
| Soft-delete restore admin path completeness | Support ops |
| Mail provider failure modes / retries | Notification reliability |
| Multi-admin race without UI passing `expectedUpdatedAt` | Wrong decision wins |
| `needs_action` semantics (women awaiting approval) misunderstood as all pending | Wrong queue counts |
| Socket/admin message inspect privacy | Compliance |

---

## What we will **not** do until review

- Large UI redesign of Members modes  
- Merging All members + Review queue  
- Renaming Prisma `ReviewStatus` values without migration plan  
- Adding Convex  
- Claiming features complete without tests  
- Implementing Phase 1+ until this plan is approved  

---

## Suggested review decision

Approve **Phase 1 scope** (P0/P1 list above) to begin implementation.  
Defer Command Center / System / granular permissions to Phases 3–4.

---

*End of Phases A–C. Awaiting review before Phase D.*
