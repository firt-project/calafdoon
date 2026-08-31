# Hel Calafkaaga — Admin Platform Final Approval Plan

**Document:** `docs/admin-platform-plan-revised.md`  
**Status:** FINAL — approval required before Phase D  
**Date:** 2026-08-01  
**Implementation:** FORBIDDEN until explicit approval of this document  

---

## Locked product decisions

These remain mandatory:

1. Keep **All members** and **Review queue** as separate modes (no merge, no stack).
2. Preserve existing member search behavior.
3. Preserve existing date-period reporting.
4. Preserve existing status history.
5. Preserve existing audit-log append model.
6. Keep NestJS + Prisma + Redis + S3.
7. No Convex.
8. No large Members UI redesign in Phase 1.

---

## Ban vs timed suspension vs pause (ambiguity resolved)

### Problem today

Ban currently sets:

- `Profile.banned = true`
- `Profile.reviewStatus = "suspended"`

Timed suspension also uses `reviewStatus = "suspended"` with `banned = false`.

That storage collision caused UI to label bans as "Suspended".

### Canonical definitions (Phase 1A)

| Concept | UI label | Database representation | Login / matching / messaging | Lift action |
|---------|----------|-------------------------|------------------------------|-------------|
| **Pause** | Paused | `banned=false`, `reviewStatus=paused`, `statusBeforePause=<prior>` | Locked (interaction lock) | **Resume** → restores `statusBeforePause` |
| **Timed suspension** | Suspended | `banned=false`, `reviewStatus=suspended`, `statusBeforeSuspend=<prior>`, optional `suspensionExpiresAt` | Locked | **Unsuspend** → restores `statusBeforeSuspend` |
| **Ban** | Banned | `banned=true`, `reviewStatus=suspended` (storage only), `statusBeforeBan=<prior>` | Locked; appeals via scoped route | **Unban** → restores `statusBeforeBan` |

### Rules

1. UI must show **Banned** when `banned===true`, never only "Suspended".
2. UI must show **Suspended** only when `reviewStatus==="suspended"` AND `banned===false`.
3. Do not rename the Prisma `ReviewStatus` enum in Phase 1.
4. Unban never auto-approves unless `statusBeforeBan === approved`.
5. Unsuspend never runs when `banned===true` (must unban instead).
6. Resume never runs unless `reviewStatus===paused`.

### Confirmed restore chains

| Chain | Result |
|-------|--------|
| Approved → Banned → Unbanned | Approved |
| Pending (`pending_review`) → Banned → Unbanned | Pending (`pending_review`) |
| Rejected → Banned → Unbanned | Rejected |
| Approved → Paused → Resumed | Approved |
| Pending → Paused → Resumed | Pending |
| Approved → Deleted → Restored | Approved |
| Rejected → Deleted → Restored | Rejected |
| Paused → Deleted → Restored | Paused |

For delete/restore, store an **exact snapshot** (including `paused` / `banned`) in `statusBeforeDelete` + `bannedBeforeDelete`. Do not unwrap pause via `capturableStatus` on delete.

For ban/pause/suspend lift paths, keep existing `statusBeforeBan` / `statusBeforePause` / `statusBeforeSuspend` capture rules (capturable non-lock status).

---

## 1. Updated Phase 1A and Phase 1B priorities

### Phase 1A — Correctness and safety

1. Admin appeals workflow (list, decide, history, audit, notify).
2. Narrowly scoped banned-user appeal access endpoint.
3. Notifications for: pause, resume, suspend, unsuspend, ban, unban, restore.
4. Require `expectedUpdatedAt` or `recordVersion` on every account decision.
5. Strengthen Stripe and EVC idempotency tests.
6. Fix registered-date keyset cursor pagination.
7. Audit: exports, private-message inspection, sensitive profile access.
8. Clarify ban versus suspension labels everywhere in admin UI.
9. Complete deleted-account soft-delete + restore workflow.
10. Require structured reasons for all serious actions.
11. Add minimal permission separation for dangerous actions.
12. Enforce the final transition matrix below (no undefined cells).

### Phase 1B — Operational reliability

1. Notification delivery tracking.
2. Retry failed notifications without replaying the account action.
3. Clear partial-success states in UI.
4. Country and phone-code mismatch warnings.
5. Duplicate-account warning signals.
6. Consistent error states for all admin actions.
7. Ban/suspension naming consistency verification.
8. User-visible account timeline verification (no internal notes).

### Later phases (not Phase 1)

- Phase 2: safe bulk actions, SLA, workload, priority, saved filters, Resubmitted tab.
- Phase 3: full RBAC UI, staff sessions, fine-grained restrictions.
- Phase 4: Command Center, system health UI, config/recovery tools.

---

## 2. Final status-transition matrix

### Effective states

| Effective status | `User.deletedAt` | `Profile.banned` | `Profile.reviewStatus` |
|------------------|------------------|------------------|------------------------|
| incomplete | null | false | incomplete |
| pending_review | null | false | pending_review |
| changes_requested | null | false | changes_requested |
| approved | null | false | approved |
| rejected | null | false | rejected |
| paused | null | false | paused |
| suspended | null | false | suspended |
| banned | null | true | suspended |
| deleted | non-null | preserved | preserved |

### Concurrency (all Allow decisions)

Every mutating account decision MUST include one of:

- `expectedUpdatedAt` matching `Profile.updatedAt`, or
- `recordVersion` matching `Profile.recordVersion`

Mismatch → HTTP **409**, no state change.

### Compact Allow / Forbid grid

| From \\ Action | approve | reject | request_changes | resubmit | pause | resume | suspend | unsuspend | ban | unban | delete | restore |
|---------------|---------|--------|-----------------|----------|-------|--------|---------|-----------|-----|-------|--------|---------|
| incomplete | ALLOW | ALLOW | ALLOW | FORBIDDEN | ALLOW | FORBIDDEN | ALLOW | FORBIDDEN | ALLOW | FORBIDDEN | ALLOW | FORBIDDEN |
| pending_review | ALLOW | ALLOW | ALLOW | FORBIDDEN | ALLOW | FORBIDDEN | ALLOW | FORBIDDEN | ALLOW | FORBIDDEN | ALLOW | FORBIDDEN |
| changes_requested | ALLOW | ALLOW | ALLOW | ALLOW if allowResubmission else FORBIDDEN | ALLOW | FORBIDDEN | ALLOW | FORBIDDEN | ALLOW | FORBIDDEN | ALLOW | FORBIDDEN |
| approved | ALLOW | ALLOW | ALLOW | FORBIDDEN | ALLOW | FORBIDDEN | ALLOW | FORBIDDEN | ALLOW | FORBIDDEN | ALLOW | FORBIDDEN |
| rejected | ALLOW | ALLOW | ALLOW | ALLOW if allowResubmission else FORBIDDEN | ALLOW | FORBIDDEN | ALLOW | FORBIDDEN | ALLOW | FORBIDDEN | ALLOW | FORBIDDEN |
| paused | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | ALLOW | ALLOW | FORBIDDEN | ALLOW | FORBIDDEN | ALLOW | FORBIDDEN |
| suspended | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | ALLOW | ALLOW | FORBIDDEN | ALLOW | FORBIDDEN |
| banned | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | ALLOW | ALLOW | FORBIDDEN |
| deleted | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | FORBIDDEN | ALLOW |

Staff profiles (`role` admin/owner): FORBIDDEN for approve, reject, request_changes, pause, suspend, delete, restore. Ban/unban only under existing owner/admin target rules.

### Allowed transitions — full specification

For every ALLOWED row below:

- Concurrency: REQUIRED (`expectedUpdatedAt` or `recordVersion`)
- Staff target: FORBIDDEN except where noted

#### From incomplete

| Action | Result | Previous-status field | Permission | Reason required | History | Audit | Notify member | Appeal after |
|--------|--------|----------------------|------------|-----------------|---------|-------|---------------|--------------|
| approve | approved | none | members.review | no | approved | USER_APPROVED | yes | no |
| reject | rejected | none | members.review | yes (code+public) | rejected | USER_REJECTED | yes | yes |
| request_changes | changes_requested | none | members.review | yes (code+public) | changes_requested | USER_CHANGES_REQUESTED | yes | no |
| pause | paused | statusBeforePause=incomplete | members.pause | yes (code; public recommended) | paused | USER_PAUSED | yes | no |
| suspend | suspended | statusBeforeSuspend=incomplete | members.suspend | yes (code+public) | suspended | USER_SUSPENDED | yes | yes |
| ban | banned | statusBeforeBan=incomplete | members.ban | yes (code+public+internal) | banned | USER_BANNED | yes | yes |
| delete | deleted | statusBeforeDelete=incomplete; bannedBeforeDelete=false | members.delete | yes (code+internal) | deleted | USER_DELETED | email if possible | no |

FORBIDDEN from incomplete: resubmit, resume, unsuspend, unban, restore.

#### From pending_review

| Action | Result | Previous-status field | Permission | Reason required | History | Audit | Notify member | Appeal after |
|--------|--------|----------------------|------------|-----------------|---------|-------|---------------|--------------|
| approve | approved | none | members.review | no | approved | USER_APPROVED | yes | no |
| reject | rejected | none | members.review | yes | rejected | USER_REJECTED | yes | yes |
| request_changes | changes_requested | none | members.review | yes | changes_requested | USER_CHANGES_REQUESTED | yes | no |
| pause | paused | statusBeforePause=pending_review | members.pause | yes | paused | USER_PAUSED | yes | no |
| suspend | suspended | statusBeforeSuspend=pending_review | members.suspend | yes | suspended | USER_SUSPENDED | yes | yes |
| ban | banned | statusBeforeBan=pending_review | members.ban | yes | banned | USER_BANNED | yes | yes |
| delete | deleted | statusBeforeDelete=pending_review; bannedBeforeDelete=false | members.delete | yes | deleted | USER_DELETED | email if possible | no |

FORBIDDEN: resubmit, resume, unsuspend, unban, restore.

#### From changes_requested

| Action | Result | Previous-status field | Permission | Reason required | History | Audit | Notify member | Appeal after |
|--------|--------|----------------------|------------|-----------------|---------|-------|---------------|--------------|
| approve | approved | none | members.review | no | approved | USER_APPROVED | yes | no |
| reject | rejected | none | members.review | yes | rejected | USER_REJECTED | yes | yes |
| request_changes | changes_requested (update instructions) | none | members.review | yes | changes_requested | USER_CHANGES_REQUESTED | yes | no |
| resubmit | pending_review | none | member self (no admin perm) | no | resubmitted | USER_RESUBMITTED | reviewer yes; member no | no |
| pause | paused | statusBeforePause=changes_requested | members.pause | yes | paused | USER_PAUSED | yes | no |
| suspend | suspended | statusBeforeSuspend=changes_requested | members.suspend | yes | suspended | USER_SUSPENDED | yes | yes |
| ban | banned | statusBeforeBan=changes_requested | members.ban | yes | banned | USER_BANNED | yes | yes |
| delete | deleted | statusBeforeDelete=changes_requested; bannedBeforeDelete=false | members.delete | yes | deleted | USER_DELETED | email if possible | no |

FORBIDDEN: resume, unsuspend, unban, restore.  
Resubmit FORBIDDEN when `allowResubmission===false`.

#### From approved

| Action | Result | Previous-status field | Permission | Reason required | History | Audit | Notify member | Appeal after |
|--------|--------|----------------------|------------|-----------------|---------|-------|---------------|--------------|
| approve | approved (idempotent) | none | members.review | no | approved | USER_APPROVED | no (idempotent silent) | no |
| reject | rejected | none | members.review | yes | rejected | USER_REJECTED | yes | yes |
| request_changes | changes_requested | none | members.review | yes | changes_requested | USER_CHANGES_REQUESTED | yes | no |
| pause | paused | statusBeforePause=approved | members.pause | yes | paused | USER_PAUSED | yes | no |
| suspend | suspended | statusBeforeSuspend=approved | members.suspend | yes | suspended | USER_SUSPENDED | yes | yes |
| ban | banned | statusBeforeBan=approved | members.ban | yes | banned | USER_BANNED | yes | yes |
| delete | deleted | statusBeforeDelete=approved; bannedBeforeDelete=false | members.delete | yes | deleted | USER_DELETED | email if possible | no |

FORBIDDEN: resubmit, resume, unsuspend, unban, restore.

#### From rejected

| Action | Result | Previous-status field | Permission | Reason required | History | Audit | Notify member | Appeal after |
|--------|--------|----------------------|------------|-----------------|---------|-------|---------------|--------------|
| approve | approved | none | members.review | no | approved | USER_APPROVED | yes | no |
| reject | rejected (update reason) | none | members.review | yes | rejected | USER_REJECTED | yes | yes |
| request_changes | changes_requested | none | members.review | yes | changes_requested | USER_CHANGES_REQUESTED | yes | no |
| resubmit | pending_review | none | member self | no | resubmitted | USER_RESUBMITTED | reviewer yes | no |
| pause | paused | statusBeforePause=rejected | members.pause | yes | paused | USER_PAUSED | yes | no |
| suspend | suspended | statusBeforeSuspend=rejected | members.suspend | yes | suspended | USER_SUSPENDED | yes | yes |
| ban | banned | statusBeforeBan=rejected | members.ban | yes | banned | USER_BANNED | yes | yes |
| delete | deleted | statusBeforeDelete=rejected; bannedBeforeDelete=false | members.delete | yes | deleted | USER_DELETED | email if possible | no |

FORBIDDEN: resume, unsuspend, unban, restore.  
Resubmit FORBIDDEN when `allowResubmission===false`.

#### From paused

| Action | Result | Previous-status field | Permission | Reason required | History | Audit | Notify member | Appeal after |
|--------|--------|----------------------|------------|-----------------|---------|-------|---------------|--------------|
| resume | statusBeforePause value | clears statusBeforePause | members.pause | no | resumed | USER_RESUMED | yes | no |
| suspend | suspended | statusBeforeSuspend=capturable(prior) | members.suspend | yes | suspended | USER_SUSPENDED | yes | yes |
| ban | banned | statusBeforeBan=capturable(prior) | members.ban | yes | banned | USER_BANNED | yes | yes |
| delete | deleted | statusBeforeDelete=paused; bannedBeforeDelete=false | members.delete | yes | deleted | USER_DELETED | email if possible | no |

FORBIDDEN from paused: approve, reject, request_changes, resubmit, pause, unsuspend, unban, restore.  
Reason: must resume (or ban/delete) before other review decisions.

#### From suspended (timed, not banned)

| Action | Result | Previous-status field | Permission | Reason required | History | Audit | Notify member | Appeal after |
|--------|--------|----------------------|------------|-----------------|---------|-------|---------------|--------------|
| unsuspend | statusBeforeSuspend value | clears statusBeforeSuspend + suspensionExpiresAt | members.suspend | no | unsuspended | USER_UNSUSPENDED | yes | no |
| ban | banned | statusBeforeBan=capturable(prior) | members.ban | yes | banned | USER_BANNED | yes | yes |
| delete | deleted | statusBeforeDelete=suspended; bannedBeforeDelete=false | members.delete | yes | deleted | USER_DELETED | email if possible | no |

FORBIDDEN from suspended: approve, reject, request_changes, resubmit, pause, resume, suspend, unban, restore.  
Reason: unsuspend or escalate to ban/delete only.

#### From banned

| Action | Result | Previous-status field | Permission | Reason required | History | Audit | Notify member | Appeal after |
|--------|--------|----------------------|------------|-----------------|---------|-------|---------------|--------------|
| unban | statusBeforeBan value; banned=false | clears statusBeforeBan | members.ban | no | unbanned | USER_UNBANNED | yes | no |
| delete | deleted | statusBeforeDelete=<stored reviewStatus>; bannedBeforeDelete=true | members.delete | yes | deleted | USER_DELETED | email if possible | no |

FORBIDDEN from banned: approve, reject, request_changes, resubmit, pause, resume, suspend, unsuspend, ban, restore.  
Reason: only unban or delete. Appeals are separate (do not change status until admin decides).

#### From deleted

| Action | Result | Previous-status field | Permission | Reason required | History | Audit | Notify member | Appeal after |
|--------|--------|----------------------|------------|-----------------|---------|-------|---------------|--------------|
| restore | statusBeforeDelete + bannedBeforeDelete | clears deletedAt; sets restoredAt; clears statusBeforeDelete | members.restore | yes (code+internal) | restored | USER_RESTORED | yes | yes if restored status is rejected or suspended or banned; otherwise no |

FORBIDDEN from deleted: all other actions.  
Reason: account is soft-deleted; only restore is valid.

### FORBIDDEN rationale summary

| Pattern | Why FORBIDDEN |
|---------|----------------|
| Review decisions while paused/suspended/banned/deleted | Status must be lifted first to avoid conflicting restore fields |
| resume when not paused | Invalid state |
| unsuspend when banned or not timed-suspended | Wrong lift path |
| unban when not banned | Invalid state |
| resubmit outside rejected/changes_requested | Invalid lifecycle |
| restore when not deleted | Invalid state |
| delete when already deleted | Idempotent reject as FORBIDDEN second delete |
| Staff profile moderation (approve/reject/pause/suspend/delete) | Privilege safety |

---

## 3. Deleted-account restore workflow

### Current reality

`DeletionService.execute` hard-deletes Profile, AuthAccount, and User.  
`User.deletedAt` / `restoredAt` exist but are unused.  
No restore API exists.  
Historically hard-deleted accounts cannot be restored.

### Phase 1A target

#### Soft delete

1. Permission: `members.delete`.
2. Require reasonCode + internalNote.
3. Require concurrency token.
4. Snapshot:
   - `statusBeforeDelete = current reviewStatus` (exact, including paused/suspended)
   - `bannedBeforeDelete = banned`
5. Set `User.deletedAt=now`, `User.restoredAt=null`.
6. Revoke sessions; block login; interaction-lock matching/chat.
7. Keep profile + payments + messages.
8. History `deleted`; Audit `USER_DELETED`.

#### Restore

1. Permission: `members.restore`.
2. Require reasonCode + internalNote + concurrency.
3. Clear `deletedAt`; set `restoredAt=now`.
4. Restore `reviewStatus=statusBeforeDelete`, `banned=bannedBeforeDelete`.
5. Never set approved unless restored status is approved.
6. History `restored`; Audit `USER_RESTORED`; notify member.

#### UI

- All members filter: `deleted`
- Restore action with reason modal

#### Hard purge

Owner-only, separate irreversible job, not part of restore. Keep behind feature flag after soft-delete ships.

---

## 4. Minimal Phase 1 permission matrix

| Permission | Default Admin | Owner |
|------------|---------------|-------|
| members.view | YES | YES |
| members.review | YES | YES |
| members.pause | YES | YES |
| members.suspend | YES | YES |
| members.ban | NO | YES |
| members.delete | NO | YES |
| members.restore | NO | YES |
| payments.review | YES | YES |
| payments.refund | NO | YES |
| messages.inspect | YES (reason required) | YES |
| exports.create | YES (audited) | YES |
| reports/support (existing role gate) | YES | YES |
| staff.manage | NO | YES |
| settings.manage | NO | YES |

Enforcement: NestJS on every request. Frontend hiding is not security.  
Owner bypasses capability checks.  
1A storage: `Profile.adminCapabilities String[]` for non-owner admins; empty means default Admin package above; Owner ignores the array.

---

## 5. Serious-action reason requirements

Store on history/audit metadata:

- `reasonCode` (required where marked)
- `publicReason` (member-visible when required/set)
- `internalNote` (staff-only)
- `performedBy`
- `performedAt` (UTC)

| Action | reasonCode | publicReason | internalNote |
|--------|------------|--------------|--------------|
| reject | REQUIRED | REQUIRED | optional |
| request_changes | REQUIRED | REQUIRED | optional |
| pause | REQUIRED | recommended | optional |
| suspend | REQUIRED | REQUIRED | optional |
| ban | REQUIRED | REQUIRED | REQUIRED |
| delete | REQUIRED | optional | REQUIRED |
| restore | REQUIRED | optional | REQUIRED |
| refund | REQUIRED | optional | REQUIRED |
| manual payment override | REQUIRED | optional | REQUIRED |
| sensitive message inspection | REQUIRED | NEVER public | optional |
| personal-data export | REQUIRED | NEVER public | optional |

Reason codes (config-driven labels):  
`PHOTO_UNCLEAR`, `PROFILE_INCOMPLETE`, `PHONE_COUNTRY_MISMATCH`, `DUPLICATE_ACCOUNT`, `PAYMENT_NOT_VERIFIED`, `IDENTITY_NOT_VERIFIED`, `INAPPROPRIATE_CONTENT`, `POLICY_VIOLATION`, `USER_REQUESTED`, `ADMIN_ERROR_CORRECTION`, `OTHER`

---

## 6. Failure and retry-state matrix

| State | Behavior |
|-------|----------|
| Loading | Disable submit; prevent double click |
| Success | Persist state; refresh UI; clear conflict token |
| Validation error | 400; show field errors |
| Permission denied | 403; permission-denied UI |
| Stale record conflict | 409; reload; show stale warning |
| Network error | Retry same action |
| Backend error | Safe message + correlation id |
| Notification failure | Partial success: account action kept; show Retry notification |
| Audit failure | Fail closed inside same DB transaction as status change |
| Retry notification | Retries delivery only; never re-executes ban/pause/delete |

Example:

> Account banned successfully.  
> Member notification failed.  
> [Retry notification]

---

## 7. Notification-event and delivery matrix

| Event | In-app | Email | Delivery row (1B) | Retry (1B) |
|-------|--------|-------|-------------------|------------|
| approved | yes | yes | yes | yes |
| rejected | yes | yes | yes | yes |
| changes_requested | yes | yes | yes | yes |
| photo_requested | yes | yes | yes | yes |
| payment_granted | yes | yes | yes | yes |
| payment_proof_rejected | yes | yes | yes | yes |
| paused | yes (1A) | yes (1A) | yes | yes |
| resumed | yes (1A) | yes (1A) | yes | yes |
| suspended | yes (1A) | yes (1A) | yes | yes |
| unsuspended | yes (1A) | yes (1A) | yes | yes |
| banned | yes (1A) | yes (1A) | yes | yes |
| unbanned | yes (1A) | yes (1A) | yes | yes |
| restored | yes (1A) | yes (1A) | yes | yes |
| appeal_updated | yes (1A) | yes (1A) | yes | yes |

Delivery fields: channel, attempt, status (`pending|sent|failed`), error, notificationId, sourceActionId, locale (`so|en`).

---

## 8. Country and phone-code validation plan

Show in admin review/detail drawer:

| Field | Source |
|-------|--------|
| Selected country | Profile.country |
| Expected calling code | Country to E.164 map |
| Entered phone | Profile.phone |
| Phone verification state | User.phoneVerificationTime null/set |
| Result | MATCH / COUNTRY_CODE_MISMATCH / PHONE_MISSING / COUNTRY_MISSING |

Example:

```
Country: Somalia
Expected code: +252
Phone: +254712345678
Result: COUNTRY_CODE_MISMATCH
```

Warning only. Never auto-reject or auto-ban.

---

## 9. Duplicate-account signal plan

Non-automatic warnings:

| Signal | Basis | If data absent |
|--------|-------|----------------|
| Same phone | Normalized phone on other non-deleted users | hide signal |
| Same email | emailNormalized | hide signal |
| Same payment reference | Stripe session id / EVC proof heuristics | hide signal |
| Same device | device id if stored | show UNAVAILABLE |
| Repeated IP | auth audit IP if stored | show UNAVAILABLE |
| Similar photo | only if similarity job exists | defer / UNAVAILABLE |

Never auto-ban from signals alone.

---

## 10. Updated automated test plan

1. Table-driven transition tests for every ALLOW and FORBIDDEN cell.
2. Soft-delete/restore chains for Approved/Rejected/Paused/Pending.
3. Ban/unban chains for Approved/Pending/Rejected.
4. Pause/resume chains for Approved/Pending.
5. Banned user appeal scoped auth success; normal APIs still blocked.
6. Admin appeal decide writes history+audit+notify.
7. Missing/stale concurrency token → 409.
8. Admin without members.delete cannot delete/restore.
9. Serious action without reasonCode → 400.
10. Stripe webhook duplicate and EVC double-approve → single grant.
11. Registered sort cursor load-more: no skip/duplicate.
12. Ban notification created; retry delivery does not re-ban.
13. Export and message inspect create audit with reasonCode.
14. Effective label tests: banned vs suspended.

Retain existing admin unit/e2e/transition/date-filter tests.

---

## 11. Updated migration plan

Additive Prisma migration(s), in order:

1. `Profile.recordVersion Int @default(0)`
2. `Profile.statusBeforeDelete ReviewStatus?`
3. `Profile.bannedBeforeDelete Boolean?`
4. `Profile.adminCapabilities String[] @default([])`
5. `NotificationDelivery` table
6. Expand `NotificationType` for restriction/appeal events
7. Optional `AdminReasonCode` config table

Use existing `User.deletedAt` and `User.restoredAt` for soft-delete.

No `ReviewStatus` enum renames in Phase 1.

Data backfill: none for historically hard-deleted users (unrestorable).

Feature flags: `ADMIN_SOFT_DELETE`, `ADMIN_APPEALS`, `ADMIN_MIN_PERMISSIONS`, `ADMIN_NOTIFY_RESTRICTIONS`.

---

## 12. Updated rollback plan

1. Disable feature flags → previous behavior paths.
2. Soft-delete off → temporary Owner-only hard delete emergency path (documented data loss).
3. Additive columns remain; unused columns are safe.
4. UI rollback independent if API accepts old clients when flags are off.
5. Do not attempt to resurrect pre-1A hard-deleted rows.

---

## 13. Exact files to change in Phase 1

### Backend

- `apps/api/prisma/schema.prisma`
- new migration under `apps/api/prisma/migrations/`
- `apps/api/src/admin/account-status.service.ts`
- `apps/api/src/admin/admin-users.service.ts`
- `apps/api/src/admin/admin-users.controller.ts`
- `apps/api/src/admin/deletion.service.ts`
- `apps/api/src/admin/account-status-member.controller.ts`
- `apps/api/src/admin/admin-auth.helpers.ts`
- `apps/api/src/auth/auth.guards.ts`
- `apps/api/src/admin/audit-log.service.ts`
- `apps/api/src/payments/evc-payments.service.ts`
- `apps/api/src/payments/grant-paid-access.service.ts`
- new: `apps/api/src/admin/admin-appeals.controller.ts`
- new: `apps/api/src/admin/admin-appeals.service.ts`
- new: notification delivery helper under `apps/api/src/notifications/`
- tests: `account-status.transitions.test.ts`, `admin.test.ts`, `test/admin.e2e.test.ts`, new soft-delete/appeal/permission tests

### Frontend

- `src/app/(app)/admin/page.tsx`
- `src/components/admin/admin-members-panel.tsx`
- `src/components/admin/admin-review-queue-panel.tsx`
- `src/components/admin/admin-user-detail-panel.tsx`
- `src/app/(app)/account-status/page.tsx`
- `src/data/admin/api.ts`
- `src/data/admin/hooks.ts`
- `src/data/admin/types.ts`
- `src/lib/review-status.ts`
- `src/lib/i18n/translations/en.ts`
- `src/lib/i18n/translations/so.ts`
- new: `src/components/admin/admin-appeals-panel.tsx`

### Docs

- `docs/admin-platform-plan-revised.md` (this file)
- `docs/admin-members.md` after ship (ban/suspend label note)

---

## 14. Exact API endpoints to add or modify

### Modify existing

| Method | Path | Change |
|--------|------|--------|
| POST | `/admin/users/:id/approve` | concurrency required; permission members.review; enforce matrix |
| POST | `/admin/users/:id/reject` | reasonCode+publicReason; concurrency; matrix |
| POST | `/admin/users/:id/request-changes` | reasonCode+publicReason; concurrency; matrix |
| POST | `/admin/users/:id/pause` | reasonCode; concurrency; notify; matrix |
| POST | `/admin/users/:id/resume` | concurrency; notify; matrix |
| POST | `/admin/users/:id/suspend` | reasonCode+publicReason; concurrency; notify; matrix |
| POST | `/admin/users/:id/unsuspend` | concurrency; notify; matrix |
| POST | `/admin/users/:id/ban` | permission members.ban; reasons; concurrency; notify; matrix |
| POST | `/admin/users/:id/unban` | permission members.ban; concurrency; notify; matrix |
| POST/DELETE | `/admin/users/:id` delete | soft-delete; members.delete; reasons; concurrency |
| GET | `/admin/users` | deleted filter; registered keyset cursor; view permission |
| GET | `/admin/users/:id` | sensitive access audit |
| GET | `/admin/conversations/:id` | messages.inspect + reason; audit |
| POST | `/account-status/appeals` | allow banned via scoped auth path |

### Add

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/admin/users/:id/restore` | soft-delete restore |
| GET | `/admin/appeals` | list appeals |
| GET | `/admin/appeals/:id` | appeal detail |
| POST | `/admin/appeals/:id/decide` | approve/reject appeal |
| POST | `/admin/notifications/:id/retry-delivery` | retry notify only |
| GET | `/admin/users/:id/duplicate-signals` | 1B signals |
| GET | `/admin/users/:id/phone-country-check` | 1B warning payload |
| POST | `/admin/exports` | audited export create |

---

## 15. Exact Prisma schema changes proposed

```prisma
// On Profile:
recordVersion        Int           @default(0) @map("record_version")
statusBeforeDelete   ReviewStatus? @map("status_before_delete")
bannedBeforeDelete   Boolean?      @map("banned_before_delete")
adminCapabilities    String[]      @default([]) @map("admin_capabilities")

// User already has:
// deletedAt DateTime?
// restoredAt DateTime?
// Phase 1A begins using these for soft-delete.

model NotificationDelivery {
  id             String   @id @default(uuid()) @db.Uuid
  notificationId String   @map("notification_id") @db.Uuid
  channel        String
  attempt        Int      @default(1)
  status         String
  error          String?
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  notification Notification @relation(fields: [notificationId], references: [id], onDelete: Cascade)

  @@index([notificationId, status])
  @@map("notification_deliveries")
}

model AdminReasonCode {
  id       String  @id @default(uuid()) @db.Uuid
  code     String  @unique
  category String
  labelEn  String  @map("label_en")
  labelSo  String  @map("label_so")
  isActive Boolean @default(true) @map("is_active")
  @@map("admin_reason_codes")
}
```

Add NotificationType values as needed:  
`account_paused`, `account_resumed`, `account_suspended`, `account_unsuspended`, `account_banned`, `account_unbanned`, `account_restored`, `appeal_updated`.

**Not changing in Phase 1:** renaming `ReviewStatus.suspended` or removing `banned`.

---

## User-visible account timeline (Phase 1B verification)

Member `/account-status` must show public fields only:

- Registered time
- Submitted time
- Current effective status (Banned vs Suspended vs Paused correctly)
- Approval time
- Rejection time + public reason
- Changes requested + public instructions
- Resubmission time
- Pause/suspension/ban public reason
- Appeal status
- Next required action

Never expose internalNote.

---

## Approval gate

This document is the single approval-ready Phase 1 plan.

**Do not implement code until explicitly approved.**

Reply with: **approve final Phase 1A/1B plan** — or list required edits.
