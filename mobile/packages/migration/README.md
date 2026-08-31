# Offline Convex → Postgres migration tooling (Phase 1–3)

See:

- `docs/MIGRATION_COMMANDS.md`
- `docs/MIGRATION_PHASE_1.md`
- `docs/MIGRATION_PHASE_2.md`
- `docs/MIGRATION_PHASE_3.md`

This package never contacts production systems (Convex, Stripe, Resend, Cloudflare R2).

## Commands

| Script | Purpose |
|--------|---------|
| `npm run migration:inspect` | Export table/storage inspection |
| `npm run migration:inspect-auth` | Password hash classification |
| `npm run migration:inspect-storage` | Phase 3 storage reference report |
| `npm run migration:dry-run` | Phase 1 core dry-run |
| `npm run migration:import-core` | Users / auth / profiles / preferences |
| `npm run migration:import-domain` | Phase 2 domain tables |
| `npm run migration:import-files` | Phase 3 blobs → local MinIO |
| `npm run migration:validate` | Phase 1 DB validation |
| `npm run migration:validate-domain` | Phase 2 DB validation |
| `npm run migration:validate-files` | Phase 3 media validation |
| `npm run migration:test` | Unit tests |
