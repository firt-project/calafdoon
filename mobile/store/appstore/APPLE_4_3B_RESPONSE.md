# Apple review 2026-10-19 — guideline 4.3(b) (saturated category) — response pack

Rejected build: 1.1.4 (13), submission 9e168e39-8b17-4430-8eb1-bd1b5fd14e9c.
What changed since: a feature no mainstream dating app has — **guardian (wali) chaperoned chat** — plus photo verification,
profile video, privacy controls. Nothing here guarantees acceptance; 4.3(b) is a judgement call by the reviewer.

## What to do (in order)
1. Codemagic → run the `ios-appstore` workflow on `main` (≥ commit with "guardian"). Wait for the TestFlight build.
2. App Store Connect → the app version → **Build**: select the new build.
3. Update the listing (below): subtitle, promotional text, description, category **Lifestyle**, and upload the 3 screenshots in
   `screenshots/guardian/` (1290×2796) as the first screenshots.
4. **Review Notes** (below) + the demo accounts.
5. In the rejection thread click **Reply** and paste the message below, then **Resubmit to App Review**.
6. If rejected again: **Contact Us → Request an appeal → App Review Board**, paste the appeal text. Do not keep resubmitting unchanged.

## Message to paste as the reply
> Hello, and thank you for the review. We understand the concern about the dating category, and we would like to explain
> why HelCalaf is a different experience, and what the reviewed build (1.1.4) did not yet show.
>
> HelCalaf is not a casual dating or swiping app. It is a marriage-matchmaking service for the Somali Muslim community,
> where families are involved in the process. Members are looking for a spouse, and the app is built around that:
>
> 1. **Guardian (wali) chaperoned chat — new in this build.** In Islamic marriage practice a guardian takes part in the
>    process. In any conversation a member can ask a family guardian to follow it. The other member must agree first.
>    The guardian receives a private, read-only link (no account needed) and sees text messages only — never photos — and
>    either member can end it at any time, which stops the link at once. Both members see a banner while a guardian is
>    following. We are not aware of another app on the store that offers this.
> 2. **Compatibility by values, not looks.** An 11-step questionnaire (faith, prayer, family, lifestyle, marriage timeline,
>    expectations) drives a compatibility score with a per-category breakdown.
> 3. **Safety built for this audience.** Staff review women's profiles before they are visible, members can verify their
>    photos with a private selfie reviewed by staff, photos can be hidden until a match, and there is reporting, blocking,
>    unmatching and message deletion, plus a child-safety page.
> 4. **Community-specific.** Full Somali and English, and local mobile-money payments.
> 5. **Personal guidance.** An optional plan with a real staff member who supports the member.
>
> To see the guardian feature, please use the two demo accounts in the review notes: open the existing chat → ⋮ →
> "Add a guardian to this chat". We respectfully ask you to reconsider under 4.3(b) or tell us what else we could change.

## Appeal text (App Review Board)
> We submitted HelCalaf, a marriage-matchmaking app for the Somali Muslim community, and it was declined under 4.3(b).
> It is not a general dating app: it is built for people seeking marriage, with family (wali) involvement at its core.
> Its distinguishing functionality: (1) a consent-based guardian chaperone for conversations, where the guardian follows a
> chat read-only through a private revocable link; (2) questionnaire-driven compatibility with a breakdown by category;
> (3) staff review of women's profiles and selfie verification; (4) photo privacy controls; (5) Somali-language support and
> local payments; (6) optional personal guidance from staff. These address a community that mainstream dating apps do not
> serve. We ask the Board to review the app against its actual functionality and the attached screenshots.

## Listing text to use
- **Name:** `HelCalaf` (or `HelCalaf: Marriage Matchmaking` if the name is taken)
- **Subtitle (≤30):** `Marriage with family involved`
- **Promotional text:** `Marriage-minded matches with real compatibility — and a guardian who can follow your chat, with both of your consent. English & Somali.`
- **Category:** Lifestyle (primary). Avoid the words "dating", "swipe", "hookup" anywhere in the listing.
- **Description — replace the first paragraph with:**
  ```
  HelCalaf is a marriage-matchmaking app for the Somali community, built so families can be part of the journey.

  NEW: GUARDIAN-FOLLOWED CHATS
  Ask your wali or a trusted family member to follow a conversation. Your match agrees first, your guardian reads along
  through a private read-only link (no photos), and either of you can end it any time.
  ```
  then keep the existing WHY / HOW IT WORKS / MEMBERSHIP / PRIVACY blocks.
- **Screenshots (in this order):** `screenshots/guardian/1-guardian-request.png`, `2-guardian-following.png`,
  `3-add-guardian.png`, then the existing questionnaire / compatibility / profile screens.
  (They are renders of the real app UI with sample, fictional names.)

## Review notes (paste into "App Review Information")
```
HelCalaf is a marriage-matchmaking service for the Somali Muslim community (members must be 18+ and seeking marriage).
Demo accounts (already paid + approved, and already matched with each other):
  Member A: <email> / <password>
  Member B: <email> / <password>
To see the guardian (wali) feature: sign in as Member A → Messages → open the chat with Member B → ⋮ menu →
"Add a guardian to this chat" → enter a name → "Ask Member B to agree". Sign in as Member B on a second device or after
signing out → open the same chat → a banner asks to Accept or Decline. After Accept, Member A sees "Share link"; the link
opens a read-only web page (no login) showing the text messages only. Either member can tap Remove to end access
immediately. Reporting/blocking: chat ⋮ menu. Account deletion: Settings → Delete account.
Payments in this build are WaafiPay / M-Pesa (mobile money) for membership access.
```
(Fill in two real demo accounts; both must be paid + approved and matched, and have at least one message.)

## Honest assessment
Dating-category 4.3(b) rejections are hard to reverse. The guardian chaperone is a genuine differentiator and the reply +
appeal give a reasonable chance, but acceptance is Apple's decision. Separate open risk: guideline 3.1.1 (in-app
payments via Paystack/Waafi instead of StoreKit) — see `../../STORE_POLICY_DECISIONS.md`. If Apple rejects again, the app
stays available on Android and the website.

## Pre-submission checklist (technical items already fixed in the repo)
- [x] ITMS-90683 — `NSLocationAlwaysAndWhenInUseUsageDescription` added to `Info.plist` (commit 2733089).
- [x] Privacy manifest `PrivacyInfo.xcprivacy` added to the app target (declares collected data + required-reason APIs) (commit 88afc87).
- [x] No iOS push prompt until APNs is configured (avoids a permission request that cannot work).
- [x] Account deletion in-app, report / block / unmatch, child-safety page, privacy policy + terms (en + so), support email.
- [x] No Sign in with Apple needed (email + password only, no third-party login).
- [ ] You: Codemagic iOS build on `main`, select the new build in App Store Connect.
- [ ] You: App Privacy ("nutrition label") in App Store Connect — same answers as the Play Data safety table (email, name, phone,
      approximate location, photos/videos, messages, user ID; none used for tracking).
- [ ] You: two demo accounts (paid + approved + matched, with a message) in the Review Notes.
- [ ] You: reply to Apple's message and resubmit (once). Do not resubmit repeatedly without a change.

## Decision recorded (2026-10-19)
Owner decided not to change payments for this resubmission, because the rejection reason was 4.3(b), not 3.1.1.
Risk to know: a reviewer who clears 4.3(b) can still raise 3.1.1 (WaafiPay / Paystack unlock instead of Apple in-app purchase).
Prepared fallback: `IOS_WEB_CHECKOUT` in `mobile/apps/client/src/platform/web-checkout.ts`, or free iPhone access, or StoreKit.
