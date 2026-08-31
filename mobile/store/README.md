# Store assets README

```text
store/
  android/
    icon/                 # Adaptive + high-res sources (RGB, no secrets)
    feature-graphic/      # 1024×500 Play feature graphic
    screenshots/en|so/    # PLACEHOLDERS — replace with device captures
  ios/
    icon/                 # 1024×1024 App Store icon (no transparency)
    screenshots/en|so/    # PLACEHOLDERS — replace with device captures
  copy/en|so/             # Listing drafts
  review/                 # Data Safety, App Privacy, review notes
```

## Status (RC1)

| Asset | Status |
|-------|--------|
| Icons / feature graphic | Generated brand placeholders ready for design polish |
| Screenshots | **Capture required** on real devices — see `store/SCREENSHOT_PLAN.md` |
| Listing copy | Draft EN/SO ready for marketing edit |
| Privacy drafts | Engineering drafts — legal confirmation required |

## Android direct install (sideload)

Until Play Store is live, share a download link:

1. Build + publish APK into the API folder:
   ```bash
   bash scripts/publish-android-apk.sh
   ```
2. Redeploy Nest on Render (so `apps/api/public/download/hel-calafkaaga.apk` is on the server).
3. Share:
   - Install page: `https://tel-calafkaaga-1.onrender.com/download`
   - Direct APK: `https://tel-calafkaaga-1.onrender.com/download/hel-calafkaaga.apk`

Phone install: open the link in Chrome → Download → allow install from browser → Install.

APK files are gitignored; they must be present on the deploy machine / Render disk when the API starts.
