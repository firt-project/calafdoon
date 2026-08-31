# App Review notes — HelCalaf (iOS)

Replace placeholders before submitting. **Do not commit real production passwords.**

## Demo access

- Environment / API: `https://api.helcalafkaaga.com` (or staging HTTPS URL provided by owner)
- Demo email: `reviewer+REPLACE@example.com`
- Demo password: provided via App Store Connect secure notes only (not in git)
- Account state: questionnaire complete, **paid access already granted** (Discover / chat unlocked)

## How to test core flows

1. Sign in with the demo account  
2. Open **Discover** — Like / Pass  
3. Open **Matches** / **Messages** — send a respectful text message  
4. Open **Profile** — add / crop a photo  
5. Open **Settings** — language EN/SO, theme, optional Face ID unlock  
6. Safety: **Report** / **Block** on a test profile  
7. Account deletion: use a **disposable** account only — Settings → Delete account  

## Payments

- Mobile app checkout is **WaafiPay (mobile wallet) only** — no in-app Stripe card UI  
- For App Review, use the **pre-paid demo account** so you do not need to complete Waafi  
- StoreKit IAP decision: see `STORE_POLICY_DECISIONS.md` (may be required before production approval)  

## Content moderation

- Users can **Report** and **Block**  
- Staff review reports via admin tooling on the backend  
- Do not claim a guaranteed response SLA unless operations commits to one  

## Age

- Adults **18+** only (self-reported age enforced server-side)  
- No government ID verification in this version  

## Contact

- Support URL: provided by product owner in App Store Connect  
- Technical contact: product owner / backend maintainer  
