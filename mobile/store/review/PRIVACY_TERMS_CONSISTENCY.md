# Privacy / Terms consistency — engineering report

**Not legal advice.** Flags for counsel / product to resolve before store submission.

| Topic | App behavior (engineering) | Policy docs to verify | Risk if mismatched |
|-------|----------------------------|-----------------------|--------------------|
| Age 18+ | Server `assertEligibleAge` / completeness rules | Privacy, Terms, store age rating | Rejection / trust |
| Messages not E2E encrypted | Server-stored chat over HTTPS | Privacy / Safety claims | Misleading marketing |
| Photos in object storage | Signed URLs; private slots exist | Privacy retention | Incomplete disclosure |
| Payments via Stripe | Checkout URL + webhooks | Terms / refunds | Billing disputes |
| Account deletion | `POST /auth/delete-account` | Privacy deletion section | Play/Apple requirement |
| Blocking / reporting | Moderation adapters | Community Guidelines | UGC compliance |
| Profile sharing | Opaque public id; discoverable-only for others | Privacy “public profile” | Oversharing claims |
| Biometric unlock | Local convenience lock | Privacy / security wording | Overclaiming protection |
| Precise location | API geolocation verify exists | Privacy location section | Undeclared collection |
| Analytics / crash | No client SDK found | Privacy analytics section | False “not collected” |
| Push notifications | Not implemented | Any push promises | False advertising |
| Voice messages | Not implemented | Feature lists | Fake feature risk |

## Recommended actions

1. Legal review of Privacy Policy + Terms against this table  
2. Explicit statement: messages are **not** end-to-end encrypted  
3. Explicit age self-attestation limitation (no ID verification)  
4. Confirm location collection wording matches mobile UI  
5. Host live HTTPS Privacy / Terms URLs for store consoles
