# Play Console checklist — release 1.1.46 (57) and later

Everything below is something only you can do in the Console (I can't sign in there).

## Before uploading
- [ ] Upload `HelCalaf-1.1.46-57-release.aab` (signed with the upload key; minSdk 24, targetSdk 36).
- [ ] Deploy the website so the updated Privacy Policy and Terms are live at
      https://www.helcalafkaaga.com/privacy and /terms (Vercel redeploys from `main`).
- [ ] Render: Bunny variables set and the latest API deployed (video + notifications depend on it).

## Policy → App content (re-answer because features were added)
- [ ] **Data safety**: add/confirm — Photos (profile + optional verification selfie), **Videos** (optional profile video),
      **Device or other IDs** (push token), Messages, Approximate location, App activity (online/last seen).
      Rows and answers are in `PLAY_STORE_SUBMISSION.md` §4. Encrypted in transit: Yes. Deletion request: Yes
      (in-app + https://www.helcalafkaaga.com/delete-account).
- [ ] **Privacy policy URL**: https://www.helcalafkaaga.com/privacy (updated 16 Oct 2026: video, selfie, push, online status, staff review, processors).
- [ ] **User-generated content (UGC) policy** — the app already has: report, block, unmatch, delete-your-messages, staff moderation,
      and a Child Safety Standards page (https://www.helcalafkaaga.com/child-safety). Mention the in-app report path in any review notes.
- [ ] **Dating app** declaration and **content rating** (IARC): still Dating, 18+; UGC + user interaction = Yes. Re-submit the questionnaire if Console asks.
- [ ] **Target audience**: 18+ only. **Ads**: No.
- [ ] **Permissions**: CAMERA, POST_NOTIFICATIONS (runtime), ACCESS_COARSE_LOCATION — no background or precise location, no photo/video library permission (system picker).
- [ ] **Financial / payments**: your in-app payments (Paystack, Waafi) are an open policy decision (`STORE_POLICY_DECISIONS.md`):
      Google Play may require Play Billing for digital unlocks. Decide before Production.

## App access (review)
- [ ] Give reviewers a test account (see `mobile/store/review/demo-account-template.md`) that is already paid and approved,
      so they can reach Discover, chat, report/block, and Settings → Delete account.

## Release notes (paste)
```
<en-US>
- Profile video (up to 30 seconds), photo verification, push notifications, reply/edit/delete messages, unmatch, privacy options and a redesigned photo screen.
- Safety, stability and security improvements.
</en-US>
<so-SO>
- Fiidiyow profile (ilaa 30 ilbiriqsi), xaqiijinta sawirka, ogeysiisyo, jawaab/tafatir/tirtir fariimaha, jebinta isbarbardhigga, doorashooyin qarsoodi iyo shaashad sawir oo la casriyeeyay.
- Hagaajin amni iyo xasillooni.
</so-SO>
```
