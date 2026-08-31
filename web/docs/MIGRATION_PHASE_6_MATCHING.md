# Hel Calafkaaga — Migration Phase 6 (Matching / Scoring / Redis)

## Scope

Local NestJS ports **discover**, **likes/pass/shortlist**, **mutual matches**, **compatibility scoring**, and **Redis rate limiting**.

Deferred: chat messaging UI/API beyond conversation stub, notifications delivery, Stripe/EVC, admin, frontend.

## Scoring model (exact Convex port)

Source: `convex/matching.ts` → `apps/api/src/matching/compatibility.ts`

| Category | Max |
|----------|-----|
| religion | 25 |
| prayer | 5 |
| age | 15 |
| country | 8 (soft) |
| height | 5 |
| education | 8 |
| children | 8 |
| maritalStatus | 5 |
| qualities | 8 |
| hobbies | 4 |
| timeline | 7 |
| wantChildren | 4 |
| livingSituation | 2 |
| languages | 2 |
| appearance | 3 |
| polygyny | 2 |

Raw sum capped to **0–100**. Stored score = `round((AB + BA) / 2)`.

`MIN_COMPATIBILITY_SCORE = 70`. `SCORE_VERSION = 1`. Field `lastCalculatedAt` on upsert.

## Queue design

- BullMQ queue `compatibility-recalc` on `REDIS_URL`
- Page size 20 opposite-gender discoverable candidates
- Job id coalescing per user; worker re-enqueues next cursor
- Profile/preferences writes call `ScoreRecalcStub.enqueue` → queue

## Endpoints

| Method | Path |
|--------|------|
| GET | `/matches/discover` |
| GET | `/matches/lists` |
| GET | `/matches/mutual` |
| GET | `/matches/:userId/breakdown` |
| POST | `/matches/:userId/action` `{ action: like\|pass\|shortlist }` |
| POST | `/matches/:matchId/seen` |
| POST | `/matches/:matchId/archive` `{ archived }` |
| GET | `/matches/:matchId/wali` |

## Action semantics

- One directed like row; **last action overwrites**
- pass/shortlist → no match, no like notification (stub audit only)
- like + reciprocal like → create/reactivate match + conversation stub
- `pairKey = min(uuid):max(uuid)` unique → race-safe single match

## Access rules

Discover/actions require: auth, questionnaire complete, paid access, discoverable (approved).  
Exclude: self, banned, blocked either direction, interacted (any action) from discover, missing photo.

Wali: active match participants only. Photos: Phase 5 visibility rules + match gate.

## Rate limits (Redis)

| Bucket | Scope |
|--------|-------|
| auth.login / forgot / reset | IP + email — **fail closed** if Redis down |
| profile.write | user — fail closed |
| matches.action | user — fail closed |
| matches.discover / breakdown | user — **degrade open** if Redis down |

## Test commands

```bash
export DATABASE_URL=postgresql://hel:hel_dev_change_me@127.0.0.1:5432/hel_calafkaaga?schema=public
export SESSION_SECRET=hel_dev_session_secret_change_me_32
export REDIS_URL=redis://127.0.0.1:6379

npm run test -w @hel/api
npm run test:e2e -w @hel/api
npx tsx apps/api/scripts/matching-parity.ts
```

## Known limitations

- Discover still primarily score-table driven (like Convex); recalculation fills scores async
- Notifications are audit stubs
- Conversation stub only (no messages API)
- Height/children filters supported in API; UI may not expose all

## Deferred

Chat messages, push/email notifications, payments, admin tools, frontend cutover.
