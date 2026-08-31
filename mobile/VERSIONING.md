# Versioning — Tel Calafkaaga

Keep these in sync for each store-bound build:

| Surface | Field | Current |
|---------|-------|---------|
| Root / client / API packages | `version` | `1.0.0` |
| Android | `versionName` | `1.0.0` |
| Android | `versionCode` | `1` (integer, must increase every Play upload) |
| iOS | `MARKETING_VERSION` | `1.0.0` |
| iOS | `CURRENT_PROJECT_VERSION` | `1` (integer, must increase every App Store / TestFlight upload) |

## How to bump

- **Patch** (bugfix): `1.0.0` → `1.0.1`; bump Android `versionCode` +1; iOS build +1
- **Minor** (features): `1.0.x` → `1.1.0`; bump codes as above
- **Major** (breaking / rebrand): `2.0.0`; bump codes as above
- **Build-only** (same marketing version, new binary): leave marketing version; only increase `versionCode` / `CURRENT_PROJECT_VERSION`

Do not publish versions automatically from CI without a human release decision.
