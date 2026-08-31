# Shadow reads (dual-read comparison)

## Purpose

While the user-facing provider remains **Convex**, optionally send equivalent **read**
requests to the Nest API in the background and compare normalized responses.

- Shadow failures **never** break Convex responses
- No writes
- No retries under load
- PII redacted; only aggregate metrics + path-only diffs

## Configuration (frontend)

| Variable | Default | Meaning |
|----------|---------|---------|
| `NEXT_PUBLIC_SHADOW_READS_ENABLED` | `false` | Master switch |
| `NEXT_PUBLIC_SHADOW_SAMPLE_PERCENT` | `10` | 0–100 sampling |
| `NEXT_PUBLIC_SHADOW_TIMEOUT_MS` | `800` | Hard timeout, no retry |
| `NEXT_PUBLIC_API_URL` | — | Shadow target (required when enabled; OK with provider=convex) |

**Do not enable in production during Phase 12.**

## Covered reads

- Auth: `getSession`, `getCurrentUser`, `bootstrapMe`
- Profile: `getProfile`, `getAccessState`
- Preferences: `getPreferences`
- Matching: `getMatches`, `getMyMatches`, `getMatchLists`, `getCompatibilityBreakdown`
- Chat: `getConversations`, `getMessages`, `getTypingStatus`
- Notifications: `list`, `unreadCount`, `getMemberReminders`
- Payments: `getStatus`
- Admin: `stats`, `analytics`, `siteMetrics`

## Implementation

- `src/data/shadow/*`
- Adapters wrapped via `wrapWithShadowReads` when `provider=convex`
- Metrics: `getShadowMetrics()` (in-memory aggregates)

## Tests

```bash
npm run test:shadow
```

## Production note

Shadow mode is a pre-cutover confidence tool. Keep disabled until an explicit
staging experiment with `provider=convex` + `NEXT_PUBLIC_API_URL` pointing at staging API.
