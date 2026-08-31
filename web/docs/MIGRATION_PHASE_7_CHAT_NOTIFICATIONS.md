# Hel Calafkaaga — Migration Phase 7 (Chat / Notifications / Real-time)

## Scope

Local NestJS ports of **conversations**, **messages**, **typing**, **unread**, **notifications**, and **Socket.IO** delivery.

Deferred: payments, EVC, admin, support, frontend cutover, Resend production email, deploy.

## Convex behavior preserved

Source: `convex/messages.ts`, `convex/notifications.ts`, `convex/matches.ts`, chat UI.

| Behavior | Convex | Nest port |
|----------|--------|-----------|
| Conversation lists | `active` / `new` / `archived` via match status + `seenAtByUser` | `GET /conversations?list=` |
| Blocked pairs | Hidden from list; send denied; historical read if id known | Same |
| Send gate | Paid **or** `match.chatUnlocked` | Same |
| Message max | 2000 chars; image body `📷 Image` | Same |
| Unread | `conversations.unreadByUser` + message `read` receipts | Same (+ Postgres UUID key normalize) |
| Typing | Convex table | **Redis TTL 4s** (not Postgres) |
| Notifications | like/match/message/announcement/approval/payment | Same types |
| Archive | `matches.archiveMatch` | Remains `POST /matches/:id/archive` |

Migrated `unreadByUser` keys are **Convex user ids**. Readers resolve Postgres UUID first, then Convex id. Writes normalize to Postgres UUID.

## HTTP endpoints

| Method | Path |
|--------|------|
| GET | `/conversations?list=active\|new\|archived` |
| GET | `/conversations/:id` |
| GET | `/conversations/:id/messages?cursor&limit` |
| POST | `/conversations/:id/messages` `{ message?, imageMediaId?, idempotencyKey? }` |
| POST | `/conversations/:id/read` |
| POST | `/conversations/:id/typing` `{ isTyping }` |
| GET | `/conversations/:id/typing` |
| GET | `/conversations/:conversationId/messages/:messageId/image-url` |
| GET | `/notifications?cursor&limit` |
| GET | `/notifications/unread-count` |
| GET | `/me/unread-count` |
| POST | `/notifications/:id/read` |
| POST | `/notifications/read-all` |
| POST | `/notifications/read` `{ types?, relatedUserId? }` |

## Socket.IO

Adapter: Redis (`@socket.io/redis-adapter`) when `REDIS_URL` is up; else in-memory.

### Handshake auth

- Cookie `hel_session` **or** `auth.token` / `x-session-token`
- Rejects expired/revoked/banned sessions
- Joins `user:{userId}` automatically
- Identity never taken from client payload

### Rooms

- `user:{userId}`
- `conversation:{conversationId}` — join only after DB participant check

### Client → server

- `conversation:join` / `conversation:leave`
- `message:send`
- `typing:start` / `typing:stop`
- `messages:read`

### Server → client

- `message:new` / `message:ack`
- `conversation:updated`
- `typing:update`
- `unread:update`
- `notification:new`
- `session:revoked`

## Unread model

- Source of truth: Postgres `conversations.unread_by_user` + `messages.read`
- Increment other participant on send (transaction)
- Mark-read zeroes viewer unread and sets peer messages `read=true`
- Idempotent mark-read
- Real-time `unread:update`
- Notification unread is separate (`notifications.read`)

## Typing model

- Redis key `typing:{conversationId}:{userId}`
- TTL **4 seconds**
- No Postgres persistence
- Rate-limited; emit only to other participant(s)

## Notification types

`like | match | message | announcement | approval | payment`

- Dedup via optional `source_key` (e.g. `message:{messageId}`)
- Email side-effect queued to BullMQ stub (**no Resend**)
- DLQ: `notification-email-dlq`

## Image access

- Store `imageMediaId` only (no raw MinIO URLs)
- Purpose `chat_image` required for new sends
- Legacy `unknown` allowed only if message-linked
- Short-lived signed GET URLs via Phase 3 media access
- Participants only; blocked pair denied on image-url endpoint

## Rate limits (Redis)

| Bucket | Fail closed? |
|--------|--------------|
| `chat.message` / `chat.image` / `chat.typing` / `chat.read` | Yes |
| `notifications.poll` | Degrade open (soft) |
| `socket.connect` | Deny connect |

## Prisma migration

`20260712220000_phase_7_chat_notifications`

- `conversations.participant_user_ids` (+ backfill from match)
- `messages.idempotency_key` (partial unique per conversation)
- `notifications.source_key` (unique when present)
- `conversations.last_message_at` index

## Test commands

```bash
cd apps/api
npm test                 # unit (includes chat helpers)
npm run test:e2e         # build + HTTP/Socket e2e (local PG/Redis/MinIO)
npx tsx scripts/chat-parity.ts
```

## Known limitations

- Frontend still on Convex — no UI cutover
- Typing no longer survives process restart (Redis TTL by design)
- No conversation archive route (match archive only — matches Convex)
- Staff moderation / admin inbox not ported
- Email notifications stubbed only
- Message list is cursor-paginated (Convex returned full thread)

## Deferred

- Stripe / EVC / payments
- Admin / support
- Frontend Socket.IO client
- Production Resend
- Deploy
