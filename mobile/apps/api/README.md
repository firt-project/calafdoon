# Nest API (`@hel/api`)

Production backend for Hel Calafkaaga.

## Run

```bash
cp .env.example .env
npm run prisma:generate -w @hel/api
npm run start:dev -w @hel/api
```

## Scripts

See `package.json`: `build`, `start:prod`, `prisma:*`, `test`, `test:e2e`, `auth:smoke`.

## Health

- `GET /health/live`
- `GET /health/ready`

## Docker

`Dockerfile` builds the API image. Prefer Compose in `infra/` for local Postgres/Redis/MinIO only.
