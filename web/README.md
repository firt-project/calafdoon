# Hel Calafkaaga — Halal Marriage Matchmaking Platform

Find your halal life partner with confidence.

## Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript, TailwindCSS, shadcn/ui, Framer Motion
- **Backend:** NestJS API (`apps/api`), PostgreSQL (Prisma), Redis, S3-compatible storage
- **Realtime:** Socket.IO
- **Payments:** Stripe (+ EVC proof flow)
- **Deployment:** Vercel (frontend) + Render (API)

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Set at least:

- `NEXT_PUBLIC_API_URL` — Nest API base URL (e.g. `http://127.0.0.1:3001`)
- `NEXT_PUBLIC_SOCKET_URL` — usually the same as the API URL
- `NEXT_PUBLIC_APP_URL` — frontend origin

API secrets (database, Redis, S3, Stripe, session) live on the Nest host — see `apps/api` and `infra/staging/`.

### 3. Run locally

```bash
# Terminal 1 — Nest API
npm run dev:api

# Terminal 2 — Next.js
npm run dev
```

### 4. Production checklist

```bash
npm run deploy:checklist
npm run preflight
```

See `infra/staging/vercel-api-mode.env.example` for live Vercel + Render env vars.
