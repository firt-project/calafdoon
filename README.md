# Calafdoon (Hel Calafkaaga)

Halal marriage matchmaking — **one product**, website + mobile + API.

## Structure

```
calafdoon/
  web/       Next.js website + NestJS API (`apps/api`)
  mobile/    Capacitor Android/iOS client + NestJS API (`apps/api`)
```

| Folder | What it is | Main commands |
|--------|------------|----------------|
| `web/` | Website (Next.js) + backend | `npm install` → `npm run dev:api` + `npm run dev` |
| `mobile/` | Mobile app (Capacitor) + backend | `npm install` → `npm run infra:up` → `npm run dev:api` + `npm run dev:client` |

Each folder is its own npm workspace so you can change **web** or **mobile** independently without breaking the other.

## Quick start

### Website

```bash
cd web
cp .env.example .env.local
npm install
npm run dev:api   # terminal 1
npm run dev       # terminal 2
```

### Mobile

```bash
cd mobile
cp infra/.env.example infra/.env
cp apps/api/.env.example apps/api/.env
cp apps/client/.env.example apps/client/.env
npm install
npm run infra:up
npm run prisma:generate
npm run dev:api      # terminal 1
npm run dev:client   # terminal 2
```

**iOS / App Store:** give the Apple developer [`mobile/IOS_DEVELOPER_HANDOFF.md`](mobile/IOS_DEVELOPER_HANDOFF.md) (macOS + Xcode required).

## Why this layout?

- **One GitHub repo** for the whole product
- **Clear folders** — edit website in `web/`, app in `mobile/`
- **Separate installs/deploys** — change one side without touching the other
- Secrets stay local (`.env*` is gitignored; only `*.example` files are committed)
