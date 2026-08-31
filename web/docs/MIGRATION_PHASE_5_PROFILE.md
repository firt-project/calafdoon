# Hel Calafkaaga — Migration Phase 5 (Profiles / Preferences / Access)

## Scope

Local NestJS API ports **member profile**, **preferences**, **questionnaire**, **access-state**, and **profile photo metadata** from Convex.

Out of scope (deferred): matching, likes, chat, notifications, Stripe/EVC payments, admin, frontend.

## Behavior source (not invented)

Mapped from:

- `convex/profiles.ts`, `convex/lib/createProfile.ts`, `convex/lib/questionnaire.ts`
- `convex/lib/profileCompleteness.ts`, `convex/lib/genderLock.ts`, `convex/lib/grantPaidAccess.ts`
- `convex/lib/roles.ts`, `convex/lib/access.ts`, `convex/lib/reviewStatus.ts`, `convex/lib/matchPresentation.ts`
- `src/lib/access.ts`, `src/lib/routes.ts`

## Endpoints

### Profile

| Method | Path | Notes |
|--------|------|-------|
| GET | `/profile/me` | Own profile or `{ profile: null }` |
| PATCH | `/profile/me` | Member-editable fields only; optional `expectedUpdatedAt` |
| POST | `/profile/ensure` | Create exactly one profile if missing |
| POST | `/profile/complete-registration-gender` | Gender + `registrationComplete` |
| POST | `/profile/complete-questionnaire` | Full completeness gate |
| POST | `/profile/questionnaire/autosave` | Partial prune autosave |
| POST | `/profile/questionnaire/update` | Step advance save |
| POST | `/profile/questionnaire/save-edits` | Post-complete edits |
| GET | `/profile/access-state` | Routing / flags |
| GET | `/profile/wali` | Own wali |
| PATCH | `/profile/wali` | Update wali |
| GET | `/profile/me/photos` | Metadata + signed GET URLs |
| POST | `/profile/photos/sign-upload` | Signed PUT to MinIO |
| POST | `/profile/photos/confirm-upload` | Verify + attach |
| DELETE | `/profile/photos/:id` | Remove from profile |
| PATCH | `/profile/photos/order` | Main + additional order |
| GET | `/profile/:id/photo-access/:mediaId` | Visibility-gated signed URL |

### Preferences

| Method | Path |
|--------|------|
| GET | `/preferences/me` |
| PUT | `/preferences/me` |
| PATCH | `/preferences/me` |

### Auth enrichment

`GET /auth/me` now also returns `accessState`.

## Access-state logic (exact)

1. Staff (`admin`/`owner`) → `/admin`
2. `registrationComplete === false` → `/register/details`
3. `!questionnaireComplete` → `/questionnaire`
4. `!hasPaidAccess` → `/payment` (trial does **not** grant access; staff count as paid)
5. Else → `/matches`

Flags: `authenticated`, `banned`, `role`, `profileExists`, `genderComplete`, `questionnaireComplete`, `hasPaid`, `hasPaidAccess`, `approved`, `reviewStatus`, `isPremium`, `hasPersonalSupport`, `waliComplete`, `needsApprovalGate`, `genderLocked`, `nextRoute`.

## Paid / approval (read-only enforcement)

- `hasPaid \|\| staff` = paid access
- Men / premium women auto-approved on payment (payment not implemented here)
- Basic paid women → `pending_review` / approval gate
- Banned → blocked

## Questionnaire

Field keys match Convex `PROFILE_FIELD_KEYS`. Autosave prunes empty/`0` writes. Completion uses `assertProfileFullyComplete` (gender-specific religious/marriage/prefs + contact + photo).

## Photos

- Max 5 total (1 main + 4 additional)
- MIME: jpeg/png/webp; ≤2MB
- Private bucket separate; visibility: everyone / matches / private
- Migrated photos resolve via `profileImageConvexId` / `additionalImageConvexIds` → `media_objects`
- Nest uploads use `profileImageMediaId` / `additionalImageMediaIds`

## Prisma migration

`20260712200000_phase_5_profile_photos_audit`

- `profiles.additional_image_media_ids`
- `profiles.private_image_media_ids`
- `profile_audit_events`

## Test commands

```bash
export DATABASE_URL=postgresql://hel:hel_dev_change_me@127.0.0.1:5432/hel_calafkaaga?schema=public
export SESSION_SECRET=hel_dev_session_secret_change_me_32

# Unit tests
npm run test -w @hel/api

# HTTP e2e (builds Nest so decorator metadata is available)
npm run test:e2e -w @hel/api
```

## Known limitations

- Score recalculation is a stub (audit + log only)
- Signup incomplete email reminder not ported
- Notifications on questionnaire complete not ported
- GPS location verify endpoint not ported
- No Redis-backed jobs yet

## Deferred

Matching, likes, chat, Stripe checkout, EVC, admin, frontend cookie wiring.
