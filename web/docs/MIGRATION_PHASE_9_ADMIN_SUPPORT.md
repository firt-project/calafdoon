# Hel Calafkaaga — Migration Phase 9 (Admin / Support / Moderation)

## Scope

Local NestJS ports of **admin member management**, **moderation**, **EVC/payment review wrappers**, **support inbox**, **staff invites**, **announcements**, **site metrics**, and **audit log viewing**.

Deferred: frontend cutover, deploy, Convex contact, live Stripe/Resend, admin grant-access button (Convex has none).

## Role matrix

| Capability | user | admin | owner |
|---|---|---|---|
| Member block/report/support | yes | yes | yes |
| Admin panel (`requireAdmin`) | no | yes | yes |
| Approve/reject/ban/delete members | no | yes | yes |
| Reports / support inbox / EVC / announcements / audit / analytics | no | yes | yes |
| `setUserRole` (demote to `user` only) | no | no | yes |
| Staff invites create/list/revoke | no | no | yes |
| Force site-metrics rebuild | no | no | yes |
| Promote to admin via role patch | — | blocked (invites only) | blocked |

Staff invite accept applies `STAFF_PROFILE_COMPLETION_PATCH` (questionnaire complete, approved, hasPaid, reviewStatus approved).

## Endpoints

### Admin users
| Method | Path |
|--------|------|
| GET | `/admin/users` |
| GET | `/admin/users/:id` |
| GET | `/admin/users/:id/activity` |
| POST | `/admin/users/:id/approve` |
| POST | `/admin/users/:id/reject` |
| POST | `/admin/users/:id/ban` |
| POST | `/admin/users/:id/unban` |
| POST | `/admin/users/:id/request-photo` |
| PATCH | `/admin/users/:id/advisor-reviewed` |
| PATCH | `/admin/users/:id/role` (owner; demote to `user` only) |
| DELETE | `/admin/users/:id` (`?dryRun=true` supported) |

No `grant-access` endpoint (matches Convex).

### Moderation
| Method | Path |
|--------|------|
| GET | `/admin/reports` |
| GET | `/admin/reports/:id` |
| POST | `/admin/reports/:id/resolve` |
| POST | `/admin/reports/:id/dismiss` |
| POST | `/moderation/block` |
| DELETE | `/moderation/block/:userId` |
| POST | `/moderation/report` |
| GET | `/moderation/blocks` |

Reasons: `fake_profile|inappropriate|harassment|spam|other`. Statuses: `open|reviewed|dismissed`.

### EVC
| Method | Path |
|--------|------|
| GET | `/admin/evc/pending` |
| GET | `/admin/evc/count` |
| GET | `/admin/evc/:id` |
| POST | `/admin/evc/:id/approve` |
| POST | `/admin/evc/:id/reject` |

Wraps Phase 8 `EvcPaymentsService`. Use artificial fixtures (export had 0 EVC rows).

### Payments
| Method | Path |
|--------|------|
| GET | `/admin/payments` |
| GET | `/admin/payments/stats` |
| GET | `/admin/payments/quarantine-summary` |
| GET | `/admin/payments/:id` |

Query filters on list: `status`, `paymentType`, `registrationTier`, `from`, `to`, `cursor`, `limit`.

Preserves 100 valid payments. Quarantine summary **dedupes to 12 unique** by `convexId` (not 24 failure-log rows). No secrets, no attach.

### Support
| Method | Path |
|--------|------|
| GET | `/admin/support` |
| GET | `/admin/support/:contactId` |
| POST | `/admin/support/:contactId/reply` |
| POST | `/admin/support/:contactId/status` |
| GET | `/support/me` |
| GET | `/support/me/:contactId` |
| POST | `/support` |
| POST | `/support/:contactId/message` |

Statuses: `open|reviewed|closed`. Public/visitor contacts cannot receive in-app staff replies.

### Staff invites (owner)
| Method | Path |
|--------|------|
| GET | `/admin/staff-invites` |
| POST | `/admin/staff-invites` |
| POST | `/admin/staff-invites/:id/revoke` |
| GET | `/staff-invites/:token` |
| POST | `/staff-invites/:token/accept` |

7-day TTL; role `admin`; new invites store `tokenHash`; migrated plaintext tokens remain lookupable. Preserve 4 migrated invites.

### Announcements
| Method | Path |
|--------|------|
| GET | `/admin/announcements` |
| POST | `/admin/announcements` |
| POST | `/admin/announcements/:id/send` |
| POST | `/admin/announcements/:id/schedule` |

Audience: `all|paid|trial|unpaid`. Fan-out notifications with `sourceKey` idempotency. Schedule within 90 days. BullMQ batch. **No Resend** for announcements (Convex does not email them). Nest creates with `convexId = local_ann_{uuid}`.

### Stats / metrics / audit
| Method | Path |
|--------|------|
| GET | `/admin/stats` |
| GET | `/admin/analytics` |
| GET | `/admin/activity` |
| GET | `/admin/site-metrics` |
| POST | `/admin/site-metrics/rebuild` (owner) |
| GET | `/admin/audit-logs` |
| GET | `/admin/audit-logs/:id` |

Audit logs are immutable (no mutation API). Null targets show original Convex IDs. Preserve ≥450 migrated logs.

## Approval / ban / delete flows

**Approve** (women Basic paid only via `requiresAdminProfileApproval`):
- Patch `approved:true`, `verified:false`, `reviewStatus:approved`, questionnaire complete step 11
- Notify `approval` + email queue; audit `approve_user`; score recalc + metrics rebuild

**Reject**: `approved:false`, `verified:false`, `reviewStatus:rejected`; Somali default message; audit `reject_user`

**Ban**: `banned:true`, `reviewStatus:suspended`. **Unban**: restore `approved→approved` else `questionnaireComplete→pending_review` else `incomplete`.

**Delete** (`DeletionService`): matches `deleteMemberAccount` cascade; sessions first; media → `orphaned_media_objects` (not physical purge in tests); audit **before** delete; audit targets SetNull; dry-run counts rows; never deletes quarantined `migration_failures`.

## Metrics architecture

Port of `convex/siteMetrics.ts`: fold profiles in pages of 100; trial fields forced to 0; schedule deduped within 2 minutes; BullMQ periodic ~30m; owner can force rebuild.

## Security

- Auth + CSRF on mutations
- Redis rate limits fail **closed** for all `admin.*` buckets
- Emails masked in list responses
- Pagination caps (max 50–100)
- No raw MinIO URLs; EVC screenshots stay staff/owner signed

## Test commands

```bash
cd apps/api
npx prisma migrate deploy
npx prisma generate
STRIPE_GATEWAY=fake npm test
STRIPE_GATEWAY=fake npm run test:e2e
npm run admin:parity
```

## Migration parity

Report: `migration-reports/phase9/admin-parity.json`

Expected floors: 100 valid payments, 12 unique quarantined, ≥450 audit logs, ≥4 staff invites, ≥1 announcement.

## Known limitations

- EVC proofs use required `userId` FK — Nest deletes EVC rows on member delete (Convex left orphans; prod export had 0 EVC)
- Support threads preserved by nulling FKs (Convex left dangling refs)
- Announcement PATCH/DELETE not ported (Convex has no such mutations)
- Member email reminder crons deferred
- Frontend remains on Convex

## Production prerequisites (later)

1. Frontend admin routes cut over to Nest
2. Redis HA for fail-closed rate limits
3. Orphaned media purge job (explicit, safe)
4. Dual-run metrics until Convex admin disabled
5. Staff invite email via Resend only when `MAIL_DRIVER=resend` on Nest
