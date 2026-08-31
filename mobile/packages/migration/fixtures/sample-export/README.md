# Sample Convex-style export (synthetic)

Used only for Phase 1 tooling practice. **Not production data.**

Password for Alice (`alice@example.com`): `SamplePass-Phase1!`  
(Lucia-compatible `saltHex:keyHex` hash in `authAccounts`.)

Intentionally broken accounts for classifier tests:

- Bob — malformed secret
- Carol — missing secret (Path B candidate)

`dry-run` will exit with code `2` while those issues remain — that is expected.
