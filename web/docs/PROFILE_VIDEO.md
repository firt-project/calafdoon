# Profile video (Bunny Stream)

One active profile video per member, up to 30 seconds. Video bytes go **directly from the
member's device to Bunny Stream** (resumable TUS upload); the Render API only creates the
video object, signs short-lived credentials, tracks status, and authorizes playback.

## Environment variables (Render → your API service → Environment)

| Variable | Where to get it | Purpose |
|---|---|---|
| `BUNNY_STREAM_LIBRARY_ID` | Bunny dashboard → Stream → your library → API | Numeric library ID |
| `BUNNY_STREAM_API_KEY` | same page, **API Key** | Server-only. Creates/deletes videos, signs upload credentials. Never sent to a browser or app. |
| `BUNNY_STREAM_READONLY_KEY` | same page, **Read-Only API Key** | HMAC key that authenticates webhook deliveries |
| `BUNNY_STREAM_TOKEN_KEY` | Library → **Security** → *Token authentication key* | Signs embed-player URLs |
| `BUNNY_STREAM_PLAYER_HOST` *(optional)* | default `player.mediadelivery.net` | Player host |

Nothing needs to be set on Vercel. Until the library ID and API key are set, the API answers
`configured: false` and the website/app hide the upload section automatically.

## Bunny dashboard configuration

1. **Library → Security**
   - Turn on **Embed View Token Authentication** (so only URLs signed by our API play).
   - Optionally add allowed referrer domains (your Vercel domain). The app's WebView uses
     `https://localhost`, so if you restrict referrers also allow `localhost`.
2. **Library → Webhooks** (or the library's webhook URL setting): set
   `https://<your-render-api-host>/webhooks/bunny-stream`
   Deliveries are verified with HMAC-SHA256 (`X-BunnyStream-Signature`) using the Read-Only key.
   The webhook is a speed-up only: the app also polls `GET /profile-video/status`, so processing
   completes even if the webhook is never configured.
3. **Encoding**: the defaults are fine. A 30 s clip encodes in well under a minute.

## Database

Migration `20261021000000_profile_video` (applied by `prisma migrate deploy` on the next Render
start) adds `profile_videos` and `bunny_video_cleanup`, plus two partial unique indexes:

- one **active** video per member, and
- one **pending** (created/uploading/processing) upload per member.

## API

| Method & path | Purpose |
|---|---|
| `POST /profile-video/upload-auth` | Create (or resume) the pending video; returns TUS credentials. Body: `contentType`, `sizeBytes`, optional `durationSec`. |
| `POST /profile-video/confirm` | The device finished sending bytes. |
| `GET /profile-video/status` | Own active / pending video, progress, last failure. Refreshes from Bunny (throttled). |
| `DELETE /profile-video` | Delete own video(s). |
| `GET /profile-video/:userId/playback` | Signed embed URL if the viewer may watch (same rules as photos + match access). |
| `POST /webhooks/bunny-stream` | Bunny processing events (signature-verified, public). |
| `GET/DELETE /admin/profile-video/:userId`, `GET …/playback` | Staff preview and removal (audited). |

## Rules enforced on the server

- Signed-in member with a profile, not banned; owner always comes from the session.
- MP4 / MOV only, ≤ 150 MB declared; client-reported duration ≤ 30 s.
- After encoding, Bunny's reported length must be ≤ 30 s (+1 s rounding) and stored size ≤ 400 MB,
  otherwise the video is rejected and deleted.
- Replacing keeps the old video until the new one is `ready`, then swaps and deletes the old one.
  A failed replacement never removes the existing video.
- Deletions go through a retry queue (`bunny_video_cleanup`) so a Bunny outage cannot orphan videos.
- Account deletion queues the member's Bunny videos in the same transaction.
- Rate limits: 12 upload authorizations/hour/user, status and playback polling limits (see `rate-limit.guard.ts`).
- Reports: viewers use the existing report flow (reason *inappropriate*, details "Profile video"). Staff can
  preview and remove a video from the member's admin page.

## Known limitations

- Bunny's TUS signature does not bind file size, so a determined user could push more bytes than
  declared. Mitigations: 2-hour credentials, one pending upload per member, rate limits, and
  post-processing length/size checks that delete oversized videos.
- A video whose duration the browser cannot read is accepted client-side; the server check after
  encoding is the authority.
- Strings are English only for now.
- `mobile/apps/api` (older copy of the API) was not changed; only `web/apps/api` is deployed.

## Cost notes

No new paid service. Bunny Stream bills storage, encoding and delivery per usage (monitor in the
Bunny dashboard → Stream → Statistics). At 10,000 members, one ≤30 s clip each is roughly a few
hundred MB per thousand members stored; delivery cost depends on views, and the player loads video
only after a viewer taps play.
