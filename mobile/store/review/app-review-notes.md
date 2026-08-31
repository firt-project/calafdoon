# App Review notes — template

Replace placeholders before submitting. **Do not commit real production passwords.**

## Demo access

- Environment: staging / review backend URL: `https://REPLACE_STAGING_API`
- Demo email: `reviewer+REPLACE@example.com`
- Demo password: provided via App Store Connect / Play Console secure notes (not in git)
- Account state: questionnaire complete, paid access enabled for Discover/chat

## How to test core flows

1. Sign in with the demo account  
2. Open **Discover** — swipe or tap Like/Pass  
3. Open **Matches** / **Messages** — send a respectful text message  
4. Open **Profile** — add/reorder a photo using crop editor  
5. Open **Settings** — switch language EN/SO, theme, enable biometric unlock if device supports it  
6. Safety: use Report/Block on a test profile  
7. Account deletion: use a **disposable** account only — Settings → Delete account

## Payments

- Production store builds may still open Stripe Checkout for digital unlock  
- **Store billing decision pending** (`STORE_POLICY_DECISIONS.md`)  
- If review builds disable checkout, note that here and provide a pre-paid demo account

## Content moderation

- Users can **Report** and **Block** from Discover safety sheet  
- Moderators review reports via existing backend tooling  
- Do not claim a guaranteed response SLA unless operations commits to one

## Age

- Adults **18+** only (self-reported age enforced server-side)  
- No government ID verification in this version

## Contact

- Support: `support@helcalafkaaga.com` (confirm live)
