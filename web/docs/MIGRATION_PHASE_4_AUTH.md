# Hel Calafkaaga — Migration Phase 4 (Authentication)

## Architecture

Local NestJS API authenticates **migrated** users against PostgreSQL:

1. Normalize email (trim + lowercase).
2. Load `users` + password `auth_accounts` + optional `profiles`.
3. Verify password:
   - **Lucia Scrypt** for migrated hashes (`saltHex:keyHex`, N=16384, r=16, p=1, dkLen=64, NFKC).
   - **Argon2id** for new / changed / rehashed passwords.
4. On success: create **server-side session** (token hash only), set HttpOnly cookie, optional rehash to Argon2id.
5. Login never creates a profile.

Mail: `MAIL_DRIVER=console` (local sink). Resend is **not** called in Phase 4.

## Hash compatibility

| Algo | When | Parameters |
|------|------|------------|
| `lucia_scrypt` | Migrated Convex hashes | Lucia defaults (see above) |
| `argon2id` | Preferred for new/reset/change/rehash | memoryCost=19456 KiB, timeCost=2, parallelism=1, hashLength=32 |

Versioning field: `auth_accounts.password_algo`.

**Rehash-on-login:** after successful Lucia verification only; write Argon2id then update `password_algo`. On rehash failure, login still succeeds and the old hash is kept.

## Session model (`sessions`)

- Idle timeout: **3 hours** (rolling `expiresAt`, touch throttled to 5 minutes)
- Absolute timeout: **7 days** (`absoluteExpiresAt`)
- Cookie: `hel_session` (HttpOnly, SameSite=Lax, Secure in production)
- CSRF: `hel_csrf` (readable) + `X-CSRF-Token` header for mutating authenticated requests
- Store **SHA-256(token)** only; IP/UA stored as hashes

## Endpoints

| Method | Path | Auth |
|--------|------|------|
| POST | `/auth/login` | Public |
| POST | `/auth/logout` | Session + CSRF |
| POST | `/auth/logout-all` | Session + CSRF |
| GET | `/auth/me` | Session |
| POST | `/auth/forgot-password` | Public (no enumeration) |
| POST | `/auth/reset-password` | Public |
| POST | `/auth/change-password` | Session + CSRF |

## Guards

- `AuthGuard` (global) + `@Public()`
- `@Roles('admin'|'owner')`, `@RequireProfile()`, `@RequirePaid()`
- `ActiveUserGuard`, `AdminGuard`, `OwnerGuard`
- `CsrfGuard`, `AuthRateLimitGuard` (IP + email)

## Reset flow

- 15-minute single-use token (hashed in DB)
- Same response for known/unknown email
- Success → Argon2id password + revoke all sessions
- Console mail redacts long tokens in logs

## Security controls

- Helmet
- CORS allowlist (`CORS_ORIGINS`)
- CSRF double-submit for cookie sessions
- Rate limit login/forgot/reset
- Secure cookies / trust proxy / request ID
- Pino redaction of passwords/tokens
- `SESSION_SECRET` required (≥32) in production
- Auth audit events (`auth_audit_events`)

## Test commands

```bash
# Unit tests (artificial passwords/hashes only)
npm run test -w @hel/api

# Apply migration
export DATABASE_URL=…
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma

# Run API
set -a && source apps/api/.env && set +a
npm run start:dev -w @hel/api

# Smoke (prompts for password; no secrets printed)
npm run auth:smoke -w @hel/api -- --email=you@example.com
```

## Known limitations

- In-memory rate limiter (not Redis yet)
- No frontend cookie wiring
- Resend not connected
- No OAuth / magic links
- CSRF requires SPA to read `hel_csrf` cookie and send header

## Production prerequisites

- Strong `SESSION_SECRET`
- `COOKIE_SECURE=true`, correct `COOKIE_DOMAIN`
- `TRUST_PROXY=true` behind reverse proxy
- Resend adapter + verified domain
- Redis-backed rate limits
- HTTPS only
