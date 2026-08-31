# Production information required (before any real cutover)

Answer these from Convex dashboard / Stripe / Resend / ops. **Do not paste secrets into this repo.**

## Data volume

- [ ] Exact table counts (users, profiles, preferences, likes, matches, conversations, messages, notifications, payments, scores, …)
- [ ] File-storage object count and total size (GB)
- [ ] Approximate active vs banned / incomplete profiles

## Authentication

- [ ] Password hash-format counts (`standard salt:key` / `s2:` legacy / missing / malformed)
- [ ] Number of accounts missing password credentials
- [ ] Confirmation whether any LegacyScrypt `s2:` hashes exist

## Traffic

- [ ] Daily message volume
- [ ] Peak concurrent chat users
- [ ] Peak discover/match traffic

## Payments / email

- [ ] Stripe pending Checkout sessions expected at freeze time
- [ ] Resend monthly volume and domain verification status
- [ ] Whether live webhook can be switched in the approved window

## People / process

- [ ] Staff and owner smoke-test account emails (not passwords)
- [ ] Maintenance-window decision and communication plan
- [ ] VPS region and provider preference
- [ ] Backup retention requirements (DB + object storage)
- [ ] Legal retention rules for EVC screenshots and deleted users

## Environment

- [ ] Confirm production Convex deployment URL vs webhook docs
- [ ] Confirm whether Next.js stays on Vercel during API migration
- [ ] Confirm acceptable rollback window length

Migration is **not** production-safe until these are answered and Phase 1 validation passes on a real export copy.
