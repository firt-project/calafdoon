#!/usr/bin/env bash
# Build / sync Hel Calafkaaga Capacitor apps (Android + iOS).
# Usage:
#   bash scripts/mobile/build.sh android-debug
#   bash scripts/mobile/build.sh android-release
#   bash scripts/mobile/build.sh ios-sync
#   bash scripts/mobile/build.sh sync
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CLIENT="$ROOT/apps/client"
CMD="${1:-}"

if [[ -z "$CMD" ]]; then
  cat <<'EOF'
Hel Calafkaaga mobile builds (Capacitor — not Expo)

  sync              Build web assets + cap sync (android + ios folders)
  android-debug     Debug APK for emulator / USB device
  android-release   Release AAB for Play Store (needs key.properties)
  android-open      Open Android Studio
  ios-sync          Build + sync iOS project (macOS)
  ios-open          Open Xcode (macOS only)

Examples:
  npm run mobile:sync
  npm run mobile:android:debug
  npm run mobile:android:release
  npm run mobile:ios:open
EOF
  exit 0
fi

need_jdk17() {
  local bundled21="$ROOT/.jdks/jdk-21"
  local bundled17="$ROOT/.jdks/jdk-17"

  # Capacitor Android plugins compile with Java 21; prefer 21, then 17.
  if [[ -z "${JAVA_HOME:-}" || ! -x "${JAVA_HOME}/bin/java" ]]; then
    if [[ -x "$bundled21/bin/java" ]]; then
      export JAVA_HOME="$bundled21"
    elif [[ -x "$bundled17/bin/java" ]]; then
      export JAVA_HOME="$bundled17"
    elif [[ -d /usr/lib/jvm/java-21-openjdk ]]; then
      export JAVA_HOME=/usr/lib/jvm/java-21-openjdk
    elif [[ -d /usr/lib/jvm/java-17-openjdk ]]; then
      export JAVA_HOME=/usr/lib/jvm/java-17-openjdk
    fi
  fi

  if [[ -n "${JAVA_HOME:-}" && -x "${JAVA_HOME}/bin/java" ]]; then
    export PATH="$JAVA_HOME/bin:$PATH"
  fi

  if ! command -v java >/dev/null 2>&1; then
    echo "Java not found. Place Temurin at .jdks/jdk-21 (preferred) or .jdks/jdk-17." >&2
    exit 1
  fi

  local ver major
  ver="$(java -version 2>&1 | head -1 || true)"
  major="$(java -XshowSettings:properties -version 2>&1 | awk -F'= ' '/java.specification.version/ {print $2; exit}' | tr -d '[:space:]')"
  if [[ -z "$major" ]]; then
    major="$(echo "$ver" | sed -nE 's/.*version "([0-9]+).*/\1/p')"
  fi
  if [[ "$major" != "17" && "$major" != "21" ]]; then
    echo "Android Gradle needs JDK 21 (or 17). Current: $ver" >&2
    echo "Fix:" >&2
    echo "  export JAVA_HOME=\"$ROOT/.jdks/jdk-21\"" >&2
    echo "Then re-run: npm run mobile:android:debug" >&2
    exit 1
  fi
  echo "==> Using Java $major ($JAVA_HOME)"
}

build_web() {
  echo "==> Building web assets (@hel/client)"
  npm run build -w @hel/client
}

case "$CMD" in
  sync)
    build_web
    echo "==> Capacitor sync"
    (cd "$CLIENT" && npx cap sync)
    echo "Done. Native projects updated under apps/client/android and apps/client/ios."
    ;;
  android-debug)
    need_jdk17
    build_web
    (cd "$CLIENT" && npx cap sync android)
    echo "==> assembleDebug"
    (cd "$CLIENT/android" && ./gradlew assembleDebug)
    APK="$CLIENT/android/app/build/outputs/apk/debug/app-debug.apk"
    echo "APK ready: $APK"
    ;;
  android-release)
    need_jdk17
    if [[ ! -f "$CLIENT/android/key.properties" ]]; then
      echo "Missing apps/client/android/key.properties (copy from key.properties.example)." >&2
      exit 1
    fi
    build_web
    (cd "$CLIENT" && npx cap sync android)
    echo "==> bundleRelease"
    (cd "$CLIENT/android" && ./gradlew bundleRelease)
    AAB="$CLIENT/android/app/build/outputs/bundle/release/app-release.aab"
    echo "AAB ready: $AAB"
    ;;
  android-open)
    (cd "$CLIENT" && npx cap open android)
    ;;
  ios-sync)
    if [[ "$(uname -s)" != "Darwin" ]]; then
      echo "iOS builds require macOS + Xcode. On Linux, use a Mac or a cloud Mac CI." >&2
      exit 1
    fi
    build_web
    (cd "$CLIENT" && npx cap sync ios)
    echo "iOS project synced. Open with: npm run mobile:ios:open"
    ;;
  ios-open)
    if [[ "$(uname -s)" != "Darwin" ]]; then
      echo "Opening Xcode requires macOS." >&2
      exit 1
    fi
    (cd "$CLIENT" && npx cap open ios)
    ;;
  *)
    echo "Unknown command: $CMD" >&2
    echo "Run without args for help." >&2
    exit 1
    ;;
esac
