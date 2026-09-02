# Web

Halal marriage matchmaking — **one product**, website + mobile + API.

> New project, forked from an earlier codebase. Brand identity still needs to be
> filled in — see `web/src/lib/constants.ts` (`TODO(rebrand)`) and the `*.env.example`
> files. Placeholder domains use `web.example.com` / `api.example.com`.

## Structure

```
web/       Next.js website + NestJS API (`apps/api`)  — deploys to Vercel
mobile/    Capacitor Android/iOS client + NestJS API (`apps/api`)
```

| Folder | What it is | Main commands |
|--------|------------|----------------|
| `web/` | Website (Next.js) + backend | `npm install` → `npm run dev:api` + `npm run dev` |
| `mobile/` | Mobile app (Capacitor) + backend | `npm install` → `npm run infra:up` → `npm run dev:api` + `npm run dev:client` |

Each folder is its own npm workspace so you can change **web** or **mobile** independently.

## Quick start (website)

```bash
cd web
cp .env.example .env.local
npm install
npm run dev:api   # terminal 1
npm run dev       # terminal 2
```

## Deploy the website to Vercel

The `web/` folder is a standalone Next.js app with its own `vercel.json`.

1. Push this repo to a new GitHub repository.
2. In Vercel, **Add New → Project**, import that repo.
3. Set **Root Directory** to `web`.
4. Add environment variables (see `web/.env.example` and
   `web/infra/staging/vercel-api-mode.env.example`).
5. Deploy.

Or from the CLI:

```bash
cd web
npx vercel        # first run links/creates the project
npx vercel --prod
```

## Mobile

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

The `mobile/` folder still carries the previous app identifiers (Android/iOS
bundle IDs, signing config) — update those separately when you take the app to
the stores.

## Notes

- Secrets stay local (`.env*` is gitignored; only `*.example` files are committed)
- Internal npm workspaces are scoped `@web/*` (`@web/api`, `@web/migration`)
