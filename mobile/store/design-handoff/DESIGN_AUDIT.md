# DESIGN_AUDIT.md — Hel Calafkaaga

## How to use this document

This audit was produced from the **live, rendered site only** (helcalafkaaga.com), not from the source code, because the codebase was not available for direct inspection during this analysis. Every finding below is something a visitor can observe today. Findings that likely require code-level confirmation (exact hex values, actual breakpoints, whether a rule is a design choice or a bug, which component owns a given block) are marked **[VERIFY IN CODE]**.

Cursor's first job (see `CURSOR_IMPLEMENTATION_PROMPT.md`) is to walk the actual repository and confirm, correct, or discard each finding here before implementing anything. Do not implement blind against this document — verify against source first.

**Site type, confirmed with the user:** a Somali-language (with English toggle) Islamic matrimonial/matchmaking platform — registration, tiered paid membership ($5–$20 for men, $2.50–$15 for women), admin-reviewed profiles, WhatsApp-based support, and a companion Android app. **Primary redesign goal: build trust and credibility.** Primary audience: bilingual Somali + English speakers, Muslim, likely mobile-first (WhatsApp and Google Play are prominent CTAs).

This changes what "good design" means here versus a generic template: every recommendation in this audit is filtered through **"does this make a stranger trust this platform enough to pay and share personal information?"** — not just "does this look nice."

---

## 1. Brand and emotional impression

**What's wrong:** The homepage currently reads as a standard SaaS/marketing template — hero image, three feature cards, numbered "how it works" steps, pricing cards, FAQ accordion, CTA band, footer. Nothing in the visual language signals *Islamic matrimonial service* specifically (no distinctive color identity, no motif, no typographic personality). It could be a template for a fitness app, a local business directory, or a dating app with the copy swapped.

**Why it damages the experience:** For a platform whose entire value proposition is "we vet real people, based on Islamic values, safely" — a generic startup look actively undercuts the pitch. Trust in matchmaking platforms is earned visually before it's earned by copy. A templated look reads as low-investment, which reads as low-vetting, which is the opposite of the brand promise.

**Severity:** Critical
**Affected:** Site-wide, especially homepage
**Recommended solution:** Establish a distinct visual identity rooted in the brand's actual values (see Step 3/4 below): a restrained, dignified palette (not startup-blue/purple), a serif+sans pairing that feels considered rather than default, and consistent visual motifs (subtle geometric pattern, not literal mosque clip-art) used sparingly in section dividers or backgrounds.

---

## 2. Typography

**What's wrong:** [VERIFY IN CODE] Based on the rendered output, heading and body text do not show a clear, deliberate type scale — sizes appear to follow default framework/utility-class steps (e.g., Tailwind's default `text-xl/2xl/3xl` ladder) rather than a custom scale tuned for this content. No visible distinction between a "display" treatment for the hero headline and standard H1/H2 usage elsewhere.

**Why it damages the experience:** Somali text tends to run longer than English for the same meaning (see hero: *"Hel Lammaanaha Noloshaada Kalsooni & Ixtiraam"*). A type scale not tuned for this creates awkward line breaks, cramped headlines, or oversized text that overwhelms mobile viewports — this is very likely happening now given the hero headline length.
**Severity:** High
**Affected:** Hero headline, all H1/H2 across pages, pricing card headings
**Recommended solution:** Custom fluid type scale via `clamp()` (defined in `DESIGN_SYSTEM.md`), tested specifically against the longest real Somali strings on the site, not against short English placeholder text.

---

## 3. Colour system

**What's wrong:** [VERIFY IN CODE] No visible signature accent color tied to brand identity beyond what appears to be a default template palette. No consistent use of a single accent color for all primary actions (Is Diiwaangeli Hadda / "Register Now" appears as the main CTA in multiple places — its color consistency across contexts needs verification).

**Why it damages the experience:** An arbitrary or default-feeling color palette (rather than one chosen to evoke calm, trust, and Islamic aesthetic sensibility — deep greens/teals, warm neutrals, restrained gold) reinforces the "generic template" impression from Finding 1.
**Severity:** High
**Affected:** Site-wide — buttons, links, pricing cards, active nav states
**Recommended solution:** Restrained 2-accent palette defined in `DESIGN_SYSTEM.md`, applied with strict consistency rules (one primary accent for all primary CTAs, no ad-hoc color introduction per section).

---

## 4. Navigation

**What's wrong:** Desktop nav currently lists: Bogga Hore (Home), Naga Saabsan (About), Sida Uu U Shaqeeyo (How It Works), Sheekooyin Guul leh (Success Stories — anchor link to homepage section), Qiimaha (Pricing), Su'aalaha (FAQ), Nala Soo Xiriir (Contact), then a language toggle (EN), then "Gal Akoonka" (Login). That's 7 primary links plus a language switch plus login, with **no visually distinct primary CTA** (Register) in the header itself — the main conversion action lives only in the hero and page body, not the persistent nav.

**Why it damages the experience:** For a platform trying to drive registrations, the header is prime real estate, and right now the strongest action (Register) is absent from it while a lower-priority link (Success Stories, which is just an anchor to a homepage section) takes equal visual weight. Seven flat links also start to feel cluttered/directory-like rather than curated, which cuts against "premium, trustworthy platform."
**Severity:** High
**Affected:** Header, all pages
**Recommended solution:** Reduce to 5 primary links + persistent, visually distinct "Is Diiwaangeli" (Register) button in the header, separate from Login. Fold "Success Stories" into the About or Home page as a section rather than a standalone nav item if it's homepage-only content anyway.

---

## 5. Hero section

**What's wrong:** Hero uses a large background photo (`hero-couple.webp`) with overlaid headline, subtext, and two CTAs ("Is Diiwaangeli Hadda" / "Eeg sida uu u shaqeeyo"), plus a short explainer with an embedded YouTube video directly beneath it.

**Why it damages the experience:** [VERIFY IN CODE] Depending on overlay contrast — need to confirm text meets WCAG AA against the photo at all viewport sizes, not just desktop crop. A single generic-looking stock-feeling "couple" photo (unless it is an actual real member photo used with permission) can undercut authenticity for a platform whose entire pitch is "real, vetted people." An embedded YouTube video directly below the hero is also a performance and attention cost this early in the page.
**Severity:** High
**Affected:** Homepage hero
**Recommended solution:** Confirm the hero image is either a real, licensed, appropriately-used photo (with model consent, culturally appropriate) or replace with an abstract/pattern-based treatment that avoids implying a specific literal couple. Move the explainer video lower on the page, below the trust/value-proposition section, so first-fold real estate goes to headline + CTA + a trust signal (see Finding 15).

---

## 6. Page structure

**What's wrong:** Homepage order is: Hero → video explainer → 3 value-prop cards → 4-step "how it works" → matching methodology blurb → pricing cards → "need guidance" WhatsApp CTA → FAQ (partial, 4 of ~6+ questions) → final CTA band → footer.

**Why it damages the experience:** Pricing appears before any concrete trust-building content (testimonials, vetting process detail, safety/privacy specifics) beyond three short bullet cards. For a paid platform asking for money before two strangers can even message, price should come *after* trust is established, not just after a generic 3-card feature list.
**Severity:** Medium
**Affected:** Homepage
**Recommended solution:** Sequence: Hero → concrete trust signals (numbers if available: members vetted, success stories, years operating) → how it works → methodology/matching explanation → pricing → FAQ → final CTA. Move video explainer to "How It Works" page/section rather than competing with the hero.

---

## 7. Spacing and alignment

**What's wrong:** [VERIFY IN CODE] Rendered output suggests uneven vertical rhythm between sections (some sections feel tightly packed, e.g., FAQ directly following pricing CTA text; others more generous). No visible consistent spacing scale.
**Severity:** Medium
**Affected:** Homepage, section boundaries site-wide
**Recommended solution:** Apply the spacing scale defined in `DESIGN_SYSTEM.md` uniformly; every section gets the same vertical padding token at each breakpoint unless there's a specific content reason to deviate.

---

## 8. Photography and image treatment

**What's wrong:** Only one clearly identifiable custom image on the homepage (`hero-couple.webp`), served via Next.js image optimization at `w=3840`, which is a very large requested width.
**Why it damages the experience:** Requesting a 3840px-wide image for what is very likely a much smaller rendered hero area on most devices wastes bandwidth and hurts load performance, especially for a mobile-first Somali-diaspora audience who may be on constrained connections. Beyond performance, the lack of any other real photography (member success stories, team, etc.) leaves the "real people" trust message entirely unsupported visually.
**Severity:** Medium (performance) / High (trust, tied to Finding 1)
**Affected:** Homepage hero, Next.js `<Image>` usage
**Recommended solution:** Set explicit, viewport-appropriate `sizes` on the Next.js Image component rather than requesting max width unconditionally. If real testimonial/success-story imagery exists (with consent) or can be sourced, add it — see Step 5 "Success Stories" section spec.

---

## 9. Buttons and calls to action

**What's wrong:** Multiple CTA labels are used for what is functionally the same action across the page ("Is Diiwaangeli Hadda", "Is Diiwaangeli Hadda" with plan query params, plain register links) — this is fine functionally, but [VERIFY IN CODE] button visual treatment (size, color, corner radius) consistency across contexts needs confirmation. Secondary actions (e.g., "Eeg sida uu u shaqeeyo" / "Kala hadal WhatsApp" / "Qiimaha") don't show a clear, consistent secondary-button style distinct from primary.
**Severity:** Medium
**Affected:** Site-wide
**Recommended solution:** Two button styles only — primary (solid, accent color, used exclusively for Register-type actions) and secondary (outline or text-link style, used for everything else). Defined precisely in `DESIGN_SYSTEM.md`.

---

## 10. Forms and registration/login experience

**What's wrong:** Not directly inspectable without codebase/authenticated access. [VERIFY IN CODE] Registration flow, field validation, error states, and the pricing-plan handoff (`?plan=basic` / `?plan=premium` query params into `/register`) need direct review.
**Severity:** High (flagged for verification — cannot assign a confirmed severity without seeing the form)
**Affected:** `/register`, `/login`
**Recommended solution:** Cursor should inspect these routes directly and apply the form styling, label, and error-state rules in `DESIGN_SYSTEM.md` and the accessibility requirements in `REDESIGN_IMPLEMENTATION.md`.

---

## 11. Mobile experience

**What's wrong:** [VERIFY IN CODE] Cannot fully confirm without a live device/viewport test, but the hero's stacked structure (large image + headline + subtext + 2 CTAs + video) is a lot of vertical content to load before any trust signal appears on a small screen, and the 7-item nav needs an accessible mobile menu treatment.
**Severity:** High
**Affected:** Header/mobile nav, homepage hero
**Recommended solution:** Full mobile-nav spec in `REDESIGN_IMPLEMENTATION.md` (hamburger, slide-in panel, focus trap, escape key, scroll lock). Hero content prioritized for mobile: headline → one primary CTA → trust signal, with secondary CTA and video pushed below the fold.

---

## 12. Accessibility

**What's wrong:** [VERIFY IN CODE] Needs direct testing: color contrast of hero text over photo, focus states on interactive elements, whether the FAQ accordion is keyboard-operable and uses correct ARIA (`aria-expanded`, etc.), whether the embedded YouTube iframe has an accessible title, form label association on `/register` and `/login`, and language attribute handling given the EN/Somali toggle (`<html lang>` should update, and both languages need to be embedded correctly for screen readers).
**Severity:** High
**Affected:** Site-wide
**Recommended solution:** Full checklist in Step 9 of `REDESIGN_IMPLEMENTATION.md`; must reach WCAG AA.

---

## 13. Performance

**What's wrong:** Oversized hero image request (Finding 8); embedded YouTube iframe loaded directly rather than a lazy "click to play" facade; [VERIFY IN CODE] font-loading strategy (are Google Fonts loaded render-blocking, or via `next/font`/Fontsource with proper `font-display`?).
**Severity:** Medium
**Affected:** Homepage
**Recommended solution:** Responsive `sizes`/`srcset` on all images, lazy-load below-fold images, replace embedded iframe with a lightweight thumbnail-and-play-on-click pattern, confirm font loading uses `font-display: swap` and is self-hosted or `next/font` where possible to avoid layout shift.

---

## 14. Content clarity (bilingual UX)

**What's wrong:** The site has an "EN" toggle in the header, but the fetched homepage content was entirely in Somali regardless — [VERIFY IN CODE] whether the EN toggle actually renders English content, or is a placeholder/not yet functional. Additionally, pricing is stated multiple times in slightly different phrasings across the page (hero area, "Sida u Shaqeeyo" step 2, pricing section intro, pricing cards, footer) — five separate restatements of the same $5/$20/$2.50/$15 figures.
**Severity:** Critical if the EN toggle is non-functional (a broken language switch is a major trust/usability failure for a bilingual product); Medium for the pricing repetition.
**Affected:** Header language toggle; pricing mentions site-wide
**Recommended solution:** Confirm EN toggle fully localizes all routes (Cursor to verify against i18n implementation in code). Consolidate pricing to one authoritative, clearly structured presentation (the pricing cards) and reference it briefly elsewhere rather than restating full figures five times.

---

## 15. Design consistency / trust signals

**What's wrong:** No visible concrete trust signals beyond the copy claim "40%+" match guidance rate and the general assertion that profiles are "admin reviewed." No visible member count, years-operating figure, verified-review quotes, or press/affiliation mentions. Contact email is rendered via Cloudflare email-obfuscation (`/cdn-cgi/l/email-protection`) rather than a visible, readable address — which for a "how do we protect your privacy/trust us" product should still be presented as a clean, human-readable contact channel, not a broken-looking placeholder link.

**Why it damages the experience:** This is the single highest-leverage fix relative to the stated goal ("build trust & credibility"). Right now the platform *asserts* trustworthiness in copy but provides almost no concrete, verifiable evidence of it.
**Severity:** Critical
**Affected:** Homepage, footer, About page
**Recommended solution:** See "Trust & Credibility" as a first-class section requirement in `REDESIGN_IMPLEMENTATION.md` — real (or honestly-labeled placeholder pending real data) stats, a clear "How We Vet Profiles" explanation with specifics, visible readable contact info, and — if available — real, consented success-story content.

---

## Severity summary

| # | Finding | Severity |
|---|---|---|
| 1 | Generic template brand impression | Critical |
| 15 | Missing concrete trust signals | Critical |
| 14a | EN toggle possibly non-functional | Critical (pending verification) |
| 2 | Type scale not tuned for Somali text length | High |
| 3 | No signature/consistent color identity | High |
| 4 | Nav overloaded, no persistent Register CTA | High |
| 5 | Hero contrast/authenticity/video placement | High |
| 8 | Trust-supporting imagery absent | High |
| 10 | Registration/login forms unverified | High (pending verification) |
| 11 | Mobile hero/nav load order | High |
| 12 | Accessibility gaps | High |
| 6 | Pricing appears before trust content | Medium |
| 7 | Inconsistent spacing rhythm | Medium |
| 8b | Oversized image requests | Medium |
| 9 | Inconsistent button styling | Medium |
| 13 | Performance (image/video/font loading) | Medium |
| 14b | Pricing repeated 5x | Medium |
