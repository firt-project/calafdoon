# Hel Calafkaaga

Halal marriage matchmaking — **NestJS backend** + **Capacitor mobile client**.

## Structure

```
apps/
  api/                 NestJS API (auth, profiles, matching, chat, payments, admin)
  client/              Hel Calafkaaga Capacitor app (React + Vite)
    android/           Native Android project (com.telcalafkaaga.app)
    ios/               Native iOS project (requires macOS/Xcode to build)
packages/
  api-client/          Shared HTTP/Socket API adapters
infra/
  docker-compose.yml   Postgres + Redis + MinIO
store/                 Play / App Store listing assets
```

## Quick start

```bash
npm install
cp infra/.env.example infra/.env
npm run infra:up
cp apps/api/.env.example apps/api/.env
npm run prisma:generate
npm run prisma:migrate:deploy -w @hel/api
npm run dev:api

# Mobile / web client
cp apps/client/.env.example apps/client/.env
npm run dev:client
```

## Play Store / release

| Doc | Purpose |
|-----|---------|
| [MOBILE_SETUP.md](./MOBILE_SETUP.md) | Cap sync, one-command builds, emulator networking |
| [GOOGLE_PLAY_RELEASE.md](./GOOGLE_PLAY_RELEASE.md) | Play Console / AAB |
| [ANDROID_RELEASE.md](./ANDROID_RELEASE.md) | Android signing + build |
| [APP_STORE_RELEASE.md](./APP_STORE_RELEASE.md) | TestFlight / App Store (macOS) |
| [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) | Pre-flight checkboxes |
| [STORE_POLICY_DECISIONS.md](./STORE_POLICY_DECISIONS.md) | IAP vs Stripe decision |
| [PRIVACY_DATA_MAP.md](./PRIVACY_DATA_MAP.md) | Data processing map |
| [LEGAL_REVIEW_CHECKLIST.md](./LEGAL_REVIEW_CHECKLIST.md) | Counsel checklist |
| [ACCOUNT_DELETION.md](./ACCOUNT_DELETION.md) | Play account-deletion requirement |
| [VERSIONING.md](./VERSIONING.md) | Version codes |
| [store/](./store/) | Icons, screenshots, listing copy |

App ID: **com.telcalafkaaga.app** · Version **1.0.0** · Capacitor **7.x** (not Expo)

```bash
# Easy path
npm run mobile:android:debug      # debug APK
npm run mobile:android:release    # Play Store AAB (needs key.properties)
npm run mobile:ios:sync           # macOS — sync Xcode project
```

Production client builds **fail** if `VITE_API_URL` is not public HTTPS (no localhost / `10.0.2.2`).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev:api` | Nest watch |
| `npm run dev:client` | Vite client |
| `npm run build:client` | Production web assets for Cap |
| `npm run test:client` | Client unit tests |
| `npm run test:api:unit` | API unit tests |
| `npm run infra:up` / `infra:down` | Docker data plane |
