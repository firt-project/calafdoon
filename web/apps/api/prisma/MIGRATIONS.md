# Prisma migrations

Apply the Phase 1 schema to a **local** database only:

```bash
cp apps/api/.env.example apps/api/.env
# start local Postgres via infra/docker-compose.yml
npm run prisma:generate -w @hel/api
npm run prisma:migrate:dev -w @hel/api -- --name phase1_init
```

Do **not** run `prisma migrate reset` against any shared or production database.
Never point `DATABASE_URL` at production during Phase 1.

## Production / Render

`npm run start:prod` runs `prisma migrate deploy` before starting the API, so pending
migrations apply automatically on each deploy. You can also run them manually:

```bash
cd apps/api && DATABASE_URL="…" npx prisma migrate deploy
```
