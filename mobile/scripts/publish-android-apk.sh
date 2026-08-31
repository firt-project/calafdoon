#!/usr/bin/env bash
# Copy the latest Android APK into the API public download folder.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DEBUG="$ROOT/apps/client/android/app/build/outputs/apk/debug/app-debug.apk"
SRC_RELEASE="$ROOT/apps/client/android/app/build/outputs/apk/release/app-release.apk"
DEST_DIR="$ROOT/apps/api/public/download"
DEST_APK="$DEST_DIR/hel-calafkaaga.apk"
STORE_COPY="$ROOT/store/android/hel-calafkaaga.apk"

mkdir -p "$DEST_DIR" "$ROOT/store/android"

if [[ -f "$SRC_RELEASE" ]]; then
  SRC="$SRC_RELEASE"
elif [[ -f "$SRC_DEBUG" ]]; then
  SRC="$SRC_DEBUG"
  echo "NOTE: using debug APK (prefer assembleRelease for public installs)."
else
  echo "No APK found. Build first:"
  echo "  cd apps/client && npx vite build && npx cap sync android"
  echo "  cd android && ./gradlew assembleDebug"
  exit 1
fi

cp -f "$SRC" "$DEST_APK"
cp -f "$SRC" "$STORE_COPY"
ls -lh "$DEST_APK"
echo
echo "After API redeploy, share:"
echo "  Install page:  https://tel-calafkaaga-1.onrender.com/download"
echo "  Direct APK:    https://tel-calafkaaga-1.onrender.com/download/hel-calafkaaga.apk"
