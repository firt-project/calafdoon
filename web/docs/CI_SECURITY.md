# CI Security (L3)

Automated security and quality checks for Hel Calafkaaga. These workflows **do not** change Render, Vercel, Docker, or application runtime behavior.

## Workflows

| Workflow | File | When |
|----------|------|------|
| **Security CI** | `.github/workflows/security-ci.yml` | `pull_request` and `push` to `main` |
| **CodeQL** | `.github/workflows/codeql.yml` | same + weekly schedule |

## What Security CI checks

1. **Install** — `npm ci` (lockfile)
2. **Prisma** — `prisma generate` + `prisma validate`
3. **Typecheck** — API `tsc --noEmit` (`npm run lint -w @hel/api`)
4. **Lint** — root ESLint (`npm run lint`) — **advisory** (large pre-existing baseline)
5. **Build** — Nest API + Next.js frontend (**must pass**)
6. **Tests** — frontend unit tests (**must pass**); API unit tests (see baseline)
7. **Dependency audit** — `npm audit`

### Dependency audit threshold

| Severity | CI behavior |
|----------|-------------|
| **critical** | **Fails** the `dependency-audit` job |
| **high** | Runs and emits a GitHub **warning** annotation (non-blocking) |
| moderate / low | Not used as a gate |

### Lint / API test soft-fail policy

| Check | Gate |
|-------|------|
| API `tsc --noEmit` | **Hard fail** |
| Next.js / Nest **build** | **Hard fail** |
| Frontend unit tests | **Hard fail** |
| ESLint | Soft fail + warning (pre-existing errors) |
| API unit tests | Soft fail + warning (2 known mock failures) |

Tighten soft-fail jobs to hard-fail once baselines are cleared.
To address findings locally:

```bash
npm audit
npm audit --audit-level=high
# Prefer targeted upgrades over `npm audit fix --force`
npm update next   # example when Next advisories appear
```

After upgrading, re-run `npm ci`, builds, and tests before merging.

## CodeQL (SAST)

- Language: **javascript-typescript**
- Query suite: `security-extended`
- Optional path filters: `.github/codeql/codeql-config.yml`
- Results: GitHub **Security → Code scanning alerts**

First-time setup: ensure Code scanning is enabled for the repository (GitHub Advanced Security / public-repo CodeQL).

## Interpreting failures

| Job fails | Meaning | What to do |
|-----------|---------|------------|
| Install / Prisma / typecheck / build | Broken types or compile | Fix before merge |
| Frontend tests | Regression in `src/data/**` (or related) | Fix tests/code |
| API tests (warning) | Suite exited non-zero | Compare to baseline below; fix new failures |
| Audit critical | Critical CVE in deps | Upgrade / replace package |
| Audit high (warning) | High CVE(s) | Schedule upgrade PR |
| CodeQL | Static finding | Triage alert; fix or dismiss with reason |

### Known API test baseline (as of L3)

- Soft-fail historically covered mock gaps; AuthService `user.update` mocks were fixed with L4.
- **~34 cancelled** admin/DB suites (no Postgres in CI)

### L4 staff MFA rollout

- Keep `REQUIRE_STAFF_MFA` unset/`false` until at least one production **owner** has enrolled and verified TOTP + recovery-code login.
- Then set `REQUIRE_STAFF_MFA=true` on the API so unenrolled admin/owner sessions are restricted to MFA enrollment (`MFA_ENROLLMENT_REQUIRED`).
- Rollback: set `REQUIRE_STAFF_MFA=false` (sessions remain valid; restriction lifts immediately). Owner can still `POST /admin/users/:id/reset-mfa` (H4).

## Local equivalents

```bash
npm ci
npm run prisma:generate
npm run prisma:validate
npm run lint -w @hel/api
npm run build -w @hel/api
npm run lint -- .
NODE_ENV=production \
  NEXT_PUBLIC_API_URL=https://example.com \
  NEXT_PUBLIC_SOCKET_URL=https://example.com \
  NEXT_PUBLIC_APP_URL=https://www.example.com \
  npm run build
npm run test:frontend
npm test -w @hel/api
npm audit --audit-level=critical
```

## Secrets

Workflows use only public/build-time env vars (dummy `DATABASE_URL`, `NEXT_PUBLIC_*`).  
Do **not** add production secrets to these jobs.
