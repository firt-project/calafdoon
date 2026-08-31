# Hel Calafkaaga — Migration Phase 2

## Purpose

Phase 2 imports **remaining non-file application data** from a local Convex export copy into local PostgreSQL.

It does **not**:

- Modify the Next.js frontend or Convex app code
- Contact production Convex / Stripe / Resend
- Deploy anything
- Migrate binary files / `_storage` blobs (only `userUploads` metadata + storage IDs)
- Migrate sessions, refresh tokens, verification codes, verifiers, typing indicators, or rate-limit buckets

## Prerequisites

- Phase 1 core import completed and validated (users, authAccounts, profiles, preferences)
- Local Postgres with Phase 1 schema applied
- Scrubbed export (recommended): `backups/convex/scrubbed-export`

## Import order

1. likes, blocks, reports  
2. matches  
3. conversations  
4. messages  
5. notifications  
6. payments + evcPaymentProofs  
7. announcements + staffInvites  
8. supportContacts + supportMessages  
9. memberEmailLog + auditLogs  
10. compatibilityScores  
11. siteMetrics  
12. userUploads metadata  

## Commands

```bash
# Dry-run (no Postgres writes) — uses export user/profile IDs for FK checks
npm run migration:import-domain -- \
  --input="$(pwd)/backups/convex/scrubbed-export" \
  --dry-run \
  --out="$(pwd)/migration-reports/phase2-dry"

# Full import (idempotent upserts)
set -a && source apps/api/.env && set +a
npm run migration:import-domain -- \
  --input="$(pwd)/backups/convex/scrubbed-export" \
  --out="$(pwd)/migration-reports/phase2"

# Validate domain tables
npm run migration:validate-domain -- \
  --input="$(pwd)/backups/convex/scrubbed-export" \
  --out="$(pwd)/migration-reports/phase2"
```

Optional: `--limit=N` per table, `--database-url=...`.

## Behaviour

- Upsert by unique `convexId` (resumable / re-runnable)
- Never deletes rows; never overwrites non-null with null/empty
- Unresolved required FKs → `migration_failures` quarantine + report
- Optional missing FKs (e.g. audit target user) → import with null + explicit skip listing
- Conversations validated against match participants inside a transaction

## Field mapping notes (Convex → Prisma)

| Source | Notes |
|--------|--------|
| matches.userA / userB | → userAId / userBId (+ convexUserA/B) |
| conversations.participants | → participantConvexIds |
| messages.message | → body; imageId → imageConvexId |
| payments | no matchId in this export; stripeSessionId unique |
| announcements.createdBy | → createdById |
| staffInvites.invitedBy | → invitedById |
| supportContacts.reviewedBy | → reviewedById |
| userUploads.storageId | → convexStorageId (metadata only) |
| siteMetrics.updatedAt | → metricsUpdatedAt |
| evcPaymentProofs | absent from this export (0 rows) |

## Reports

- `import-domain-report.json` / `.md`
- `validation-domain-report.json` / `.md`
