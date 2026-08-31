# Production Cutover Readiness (Phase 12 snapshot)

**Production remains on Convex. Do not switch.**

## Classification

| Item | Status |
|------|--------|
| Functional / auth / adapter parity | PASS |
| Forbidden Convex imports = 0 | PASS |
| Shadow reads implemented (default OFF) | PASS |
| Local Nest `/health` + `/ready` (phase 12) | PASS |
| Observability metrics endpoint | PASS |
| Playwright 20/20 green | WARNING |
| Authenticated load + socket recovery proof | WARNING |
| Media missing objects (28/392) | WARNING |
| Backup/restore proven on this host | WARNING |
| Cloud private HTTPS staging | BLOCKER |
| Production provider flip | BLOCKER |

## Remaining blockers

1. Deploy private HTTPS cloud staging (separate DB/Redis/storage/secrets)
2. Playwright 20/20 green on confirmed API-mode Next
3. Operator-run `staging:backup-restore-test` with pg tools
4. Explicit approval to set production `NEXT_PUBLIC_BACKEND_PROVIDER=api`

See `docs/PRODUCTION_CUTOVER_PLAN.md` and `docs/ROLLBACK_RUNBOOK.md`.
