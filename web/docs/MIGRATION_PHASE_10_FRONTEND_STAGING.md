# Hel Calafkaaga — Migration Phase 10 (Frontend Adapter Layer)

## Scope

Frontend **adapter layer** so the Next.js app can talk to either:

- **Convex** (default, production today) via existing `api.*` + Convex Auth
- **Nest API** (`NEXT_PUBLIC_BACKEND_PROVIDER=api`) via REST + Socket.IO

No production cutover. Convex packages and `ConvexAuthProvider` remain. Stripe/webhooks unchanged.

## Critical env rule

```bash
NEXT_PUBLIC_BACKEND_PROVIDER=convex   # default — never auto-infer to api
NEXT_PUBLIC_API_URL=http://127.0.0.1:3001
NEXT_PUBLIC_SOCKET_URL=http://127.0.0.1:3001
```

Production builds stay on Convex unless env is **explicitly** set to `api`.

## What landed

| Area | Path |
|------|------|
| Provider / env | `src/data/provider.ts`, `src/data/env.ts` |
| REST client | `src/data/api-client.ts` (CSRF `hel_csrf` → `X-CSRF-Token`, retries, timeout) |
| Socket client | `src/data/realtime/socket-client.ts` |
| Telemetry | `src/data/telemetry.ts` |
| Domain adapters | `src/data/{auth,profile,preferences,questionnaire,photos,matching,chat,notifications,payments,support,admin,moderation}/` |
| Api auth | `src/components/auth/api-auth-provider.tsx` |
| Providers | `src/components/providers.tsx` branches on provider |
| Deps report | `npm run frontend:convex-deps` → `migration-reports/phase10/direct-convex-deps.json` |

Each domain: `types.ts` + `api.ts` + `convex.ts` + `index.ts` (+ `hooks.ts` where reactive).

## Wired entry points (both modes)

1. Auth: login, sign-out, guest-gate, idle-session, trial-access-sync, dashboard-layout
2. Profile page (adapter hooks)
3. Questionnaire mutations (adapter hooks)
4. Photos upload adapter (`useUploadPhoto` / EXIF strip preserved)
5. Matching + likes pages
6. Chat page (REST + Socket.IO in API mode)
7. Notifications mark-read hook bridge
8. Payment gate / success / EVC / premium upgrade
9. Support contact card
10. Admin page (stats, users, reports, payments, audit, announcements) + members / EVC / detail panels

Remaining shell/marketing files may still import Convex directly — track with `frontend:convex-deps`.

## Local API mode smoke

```bash
# Terminal A — Nest
npm run dev:api

# Terminal B — Next with explicit api provider
NEXT_PUBLIC_BACKEND_PROVIDER=api \
NEXT_PUBLIC_API_URL=http://127.0.0.1:3001 \
NEXT_PUBLIC_SOCKET_URL=http://127.0.0.1:3001 \
npm run dev:next
```

Default Convex mode (unchanged):

```bash
NEXT_PUBLIC_BACKEND_PROVIDER=convex npm run dev:next
```

## Tests

```bash
npm run test:frontend
npm run frontend:convex-deps
npm run test:e2e:staging   # stubs; set STAGING_E2E=1 for real staging
```

## Rollback

Set `NEXT_PUBLIC_BACKEND_PROVIDER=convex`, rebuild/redeploy frontend. No database rollback required.

## Known gaps / unresolved

- Nest has **no register** endpoint yet — API `auth.register` throws; registration stays Convex-only until a later phase
- Nest public contact may require auth; marketing `/contact` still Convex in practice
- Forgot-password UI still Convex Auth OTP; Nest token reset exists but UI not fully cut over
- Staff invite accept page still mixed Convex Auth
- Dual-read / shadow traffic not implemented
- Staging Playwright specs are stubs unless `STAGING_E2E=1`

## Do not

- Flip production to `api` without staging sign-off
- Remove `@convex-dev/auth` or Convex packages
- Change live Stripe webhook endpoints
