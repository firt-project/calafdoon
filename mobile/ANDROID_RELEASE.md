# Android release — HelCalaf

## Identity

- `applicationId`: `com.helcalaf.app`
- Display name: HelCalaf
- Deep link scheme: `helcalaf://`

## Debug APK (developer machine with Android SDK + **JDK 17**)

OpenJDK 25 is **not** supported — use **JDK 21** (preferred) or **JDK 17**.

This repo ships a local Temurin JDK under `.jdks/` (gitignored). The mobile build script picks **jdk-21** automatically:

```bash
npm run mobile:android:debug
```

Or set it yourself:

```bash
export JAVA_HOME="$PWD/.jdks/jdk-21"
export PATH="$JAVA_HOME/bin:$PATH"
```

System install (Fedora): `sudo dnf install -y java-21-openjdk-devel`

```bash
cd apps/client
npm run build
npx cap sync android
cd android
./gradlew assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

Emulator API URL: `http://10.0.2.2:4000` in `apps/client/.env` before build/sync (debug cleartext overlay only).

## Signing

Copy `key.properties.example` → `key.properties` (gitignored). `app/build.gradle` applies the release signing config when the file exists.

## Release bundle

1. Create a release keystore **outside the repo**. Never commit it.
2. Configure `android/key.properties` (gitignored) or CI secrets.
3. Build:

```bash
cd apps/client/android
./gradlew bundleRelease
```

4. Upload the AAB to Play Console.

## Permissions (current)

- `INTERNET`, `ACCESS_NETWORK_STATE`
- `CAMERA`, `READ_MEDIA_IMAGES` (profile photos)
- Camera hardware optional
- Biometric prompt uses the AndroidX Biometric library via `@aparajita/capacitor-biometric-auth` (no extra dangerous permission beyond device biometrics enrollment)

## Network

`network_security_config.xml` denies cleartext by default; allows cleartext only for `10.0.2.2`, `10.0.3.2`, `localhost`, `127.0.0.1` for local API development.

Production API must be HTTPS.

## Notes

- Portrait lock is set on `MainActivity`
- Deep link scheme: `helcalaf://`
- Backup disabled (`allowBackup=false`) to reduce token leakage risk
