# Mobile setup — Tel Calafkaaga

Capacitor **7.x** React + Vite client in `apps/client`, talking to Nest API in `apps/api`.

> **Not Expo.** This app is a web UI wrapped with Capacitor. Expo is React Native and would require rewriting every screen. Use the one-command Capacitor scripts below for easy Android / iOS builds.

## Easy builds (recommended)

From the repo root (needs Node 20+, Android Studio SDK for Android, **JDK 17**):

```bash
# Update native projects after UI changes
npm run mobile:sync

# Debug APK (emulator / USB phone)
npm run mobile:android:debug
# → apps/client/android/app/build/outputs/apk/debug/app-debug.apk

# Play Store AAB (needs apps/client/android/key.properties)
npm run mobile:android:release

# Open Android Studio / Xcode
npm run mobile:android:open
npm run mobile:ios:open      # macOS only
npm run mobile:ios:sync      # macOS only
```

Help: `bash scripts/mobile/build.sh`

## Prerequisites

- Node 20+
- Nest API running (`apps/api` — see `apps/api/.env.example` and `infra/`)
- Android Studio + SDK for Android builds
- **macOS + Xcode** for iOS builds (not available on Linux CI hosts)
- **JDK 21** for Gradle (OpenJDK 25 fails with “Unsupported class file major version 69”). Local copies live in `.jdks/jdk-21` and are used automatically by `npm run mobile:android:*`

## Environment

Copy `apps/client/.env.example` → `apps/client/.env`:

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | Nest HTTP base (no trailing slash) |
| `VITE_SOCKET_URL` | Socket.IO origin (often same as API) |
| `VITE_APP_URL` | App origin / deep-link return host |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Public Stripe key only |
| `VITE_USE_LOCAL_DEMO` | Must be `false` for production |

### Networking

| Target | Typical API URL |
|--------|-----------------|
| Desktop web / iOS Simulator | `http://127.0.0.1:4000` |
| Android emulator | `http://10.0.2.2:4000` |
| Physical device | `http://<LAN-IP>:4000` (HTTPS preferred) |

Android cleartext is allowed **only** for loopback/emulator domains via `network_security_config.xml`. Production traffic must be HTTPS.

CORS on the API must allow the Capacitor origin / Vite `5173`.

## Commands

```bash
# Web UI against local API
cp apps/client/.env.example apps/client/.env
# edit VITE_API_URL for your platform
npm run dev:client

# Typecheck / lint / test / web build
npm run typecheck -w @hel/client
npm run lint -w @hel/client
npm run test -w @hel/client
npm run build -w @hel/client

# Sync web assets into native projects
npm run mobile:sync

# Optional bundle report (dev artifact only)
ANALYZE=1 VITE_API_URL=https://api.example.com VITE_SOCKET_URL=https://api.example.com npm run build -w @hel/client
```

## Phase 5 native extras

After `npm install` / `cap sync`, confirm biometric plugin is listed. On iOS, Face ID usage string is in `Info.plist`. Enable biometric unlock only from Settings after signing in.

## App identity

- Display name: **Tel Calafkaaga**
- Application ID / bundle ID: **com.telcalafkaaga.app**
- Deep-link scheme: `telcalafkaaga://`

## Local-demo

Legacy offline code lives under `apps/client/src/mocks/` and is **excluded** from production builds. Do not enable `VITE_USE_LOCAL_DEMO` in store builds.

## Why not Expo?

| | This repo (Capacitor) | Expo |
|--|----------------------|------|
| UI | React DOM + CSS (already built) | React Native rewrite |
| Effort to ship | Sync + Gradle / Xcode | Re-implement all screens |
| Easy Android APK | `npm run mobile:android:debug` | `eas build` after rewrite |
| iOS on Linux | Needs Mac / cloud Mac | Same — still needs Apple tooling |

If you want a greenfield Expo app later, say so and we can scaffold `apps/mobile-expo` and migrate screen-by-screen. Do **not** drop Capacitor until Expo feature parity exists.
