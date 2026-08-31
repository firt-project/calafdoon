# Hel Calafkaaga — Migration Phase 1

## Purpose

Phase 1 prepares a **separate** NestJS + PostgreSQL + Prisma workspace and offline migration tooling.

It does **not**:

- Modify the Next.js frontend
- Modify Convex application code
- Connect to production Convex, Stripe, or Resend
- Deploy anything
- Port matching, chat, payments, or admin APIs

## Layout

```
apps/api/                 NestJS foundation + Prisma schema + health endpoint
packages/migration/       Offline inspect / dry-run / core import / validate CLI
infra/docker-compose.yml  Local Postgres + Redis + API
docs/                     This documentation
```

## Safety rules

- Always pass an **absolute** `--input=` path to a **copied** export
- Never hardcode production paths
- Never print full password hashes
- Never run `prisma migrate reset` against shared/production data
- Never delete Convex data

## Next steps after Phase 1

1. Fill `docs/PRODUCTION_INFORMATION_REQUIRED.md`
2. Obtain a **copied** Convex export offline
3. Run inspect + inspect-auth on that copy
4. Bring up local Docker Postgres
5. Apply Prisma migrations locally
6. Dry-run + import-core with `--limit=20`
7. Run validate

See `docs/MIGRATION_COMMANDS.md` for exact commands.
