# REDESIGN_IMPLEMENTATION.md — Hel Calafkaaga

Read this alongside `DESIGN_AUDIT.md` (problems) and `DESIGN_SYSTEM.md` (tokens). File paths below are **best-guess placeholders based on the site running on Next.js** (inferred from `_next/image` URLs) — Cursor must confirm actual paths against the real repo structure in Stage 0 and correct this document's references as it goes, noting any corrections in its final report.

---

## Stage 0 — Repository inspection (do this before writing any code)

- Confirm framework/version (Next.js — App Router or Pages Router?), styling approach (Tailwind config? CSS Modules? styled-components?), and i18n approach (how does the EN/Somali toggle work today — is it functional?).
- Locate: header/nav component, footer component, hero component, pricing component, FAQ accordion component, homepage route, `/about`, `/how-it-works`, `/pricing`, `/faq`, `/contact`, `/register`, `/login`.
- Locate current design tokens (Tailwind config, CSS variables, theme file) if any exist.
- Confirm current font-loading method.
- Confirm whether analytics/tracking scripts are present (do not remove).
- Report findings before proceeding to Stage 1, and correct any wrong assumptions in this document.

---

## Stage 1 — Design tokens (foundation, do first)

**Priority:** Critical (blocks all other work)
**Files:** Tailwind config / CSS variables root file (confirm location in Stage 0)
**Tasks:**
- Add all color tokens from `DESIGN_SYSTEM.md` §1 as CSS custom properties and/or Tailwind theme extension.
- Add font tokens (Fraunces via `next/font/google`, Inter via `next/font/google`).
- Add spacing scale, radius, shadow, breakpoint, and motion tokens.
**Acceptance criteria:** Tokens compile with no errors; a test page/story renders all colors and type styles correctly; no visual change to the live site yet (tokens only, not yet applied).
**Testing:** `npm run build` / `next build` succeeds; lint passes.

---

## Stage 2 — Header & Navigation

**Priority:** Critical
**Files:** Header/nav component (confirm path)
**Components to update:** Existing nav component
**Tasks:**
- Reduce primary nav to 5 links: Bogga Hore, Naga Saabsan, Sida Uu U Shaqeeyo, Qiimaha, Su'aalaha. Move Contact into footer-only or a small header icon/link if space is tight; fold "Sheekooyin Guul leh" into the About page as an anchor rather than a top-level nav item (per audit Finding 4).
- Add a visually distinct **primary button** "Is Diiwaangeli" (Register) in the header, separate from the existing "Gal Akoonka" (Login) text link.
- Sticky header on scroll: becomes a condensed bar (reduced vertical padding, same tokens) after ~80px scroll; retains full contrast and the Register CTA at all times.
- Active nav state: current route gets `--color-accent` text + a 2px underline (not just a color change, for accessibility).
- Language toggle (EN/Somali) remains visible in header at all breakpoints; **verify it actually switches content** per audit Finding 14.

**Mobile navigation:**
- Hamburger icon opens a full-height slide-in panel (from the right, `280ms` ease per motion tokens) containing the same 5 links + Register + Login + language toggle, stacked, `44px` min tap targets.
- Focus moves to the first link on open; `Escape` closes and returns focus to the hamburger button; body scroll locks while open; clicking outside the panel or the close (×) icon closes it.
- Respect `prefers-reduced-motion`: panel appears instantly instead of sliding if set.

**Anchor offset / smooth scroll:** any in-page anchor links (e.g., FAQ section from footer) must account for sticky header height in scroll-margin-top; smooth scroll behavior wrapped in `prefers-reduced-motion` check.

**Acceptance criteria:** Keyboard-only user can open menu, tab through all links, close with Escape, and focus returns correctly. No layout shift when header becomes sticky. Register CTA visible in header on all breakpoints ≥ 375px width.
**Testing:** Manual keyboard nav test; Lighthouse accessibility check; test at 375px, 768px, 1024px, 1440px.

---

## Stage 3 — Homepage

**Priority:** Critical
**File:** Homepage route (confirm path, e.g. `app/page.tsx`)

### Hero
- **Purpose:** Immediate clarity on what the platform is + one strong primary action + earliest possible trust signal.
- **Content hierarchy:** Eyebrow label ("Hel Calafkaaga") → Display headline → one-line subtext → primary CTA (Register) + secondary CTA (How It Works) → a compact trust strip directly beneath (e.g., "Waxaan hubinaa qof kasta" / admin-reviewed badge + any real stat available).
- **Desktop:** Two-column option — text/CTA left (reading-width constrained), image right; OR full-bleed image with overlay text if the image is strong. Recommend **image right / text left** to avoid legibility risk from overlay contrast (Finding 5) unless image is confirmed high-contrast-safe.
- **Tablet:** Stack image below text.
- **Mobile:** Text → primary CTA → trust strip → image (image can move below CTA to prioritize action, per audit Finding 11); secondary CTA and video move further down.
- **Image behaviour:** Explicit `sizes` attribute on Next.js `<Image>` matching actual rendered width at each breakpoint (never request `w=3840` unconditionally); `priority` loading only for the hero image, everything else lazy.
- **Accessibility:** Headline is a real `<h1>`; image has descriptive `alt` (or `alt=""` if purely decorative and headline conveys full meaning).

### Video explainer
- Move from directly-under-hero to the "How It Works" section (or its own subsection just above the 4-step list) so the hero isn't followed immediately by a heavy embed.
- Replace direct iframe embed with a lightweight thumbnail + play button that loads the YouTube iframe only on click (facade pattern) — removes third-party script weight from initial load.
- Accessible label on the play control (e.g., "Daawo tillinka: sida xubnuhu u isticmaalaan Hel Calafkaaga").

### Trust & credibility section (NEW — highest-priority content addition)
- **Purpose:** Directly serve the stated redesign goal. Insert this section between the value-prop cards and "How It Works," before pricing.
- **Content:** Concrete explanation of the vetting process (what "admin reviewed" actually means, step by step), plus any real, honestly-sourced numbers (members, years active, countries served) — **do not fabricate statistics**; if no real numbers exist yet, use qualitative trust content only (vetting process detail, privacy commitment specifics, Islamic-values framing already in copy) rather than inventing figures.
- **Layout:** Desktop: 2-column (short intro text left, 3–4 line-item vetting steps right, or a simple icon+text list). Mobile: single column stack.
- Flag to site owner: **[NEEDS REAL CONTENT]** — this section's persuasive power depends on real data; implement the structure now, populate with honest current copy, and leave clearly marked placeholders only where a real statistic would go later.

### Value proposition cards (existing 3: Qiyamka Islaamka / Profile-yo admin dib u eegay / Qarsoodi & Amaan)
- Keep content, restyle per `DESIGN_SYSTEM.md` card tokens (no shadow, bordered, consistent icon treatment — recommend simple line icons, one per card, in `--color-accent`).
- Desktop: 3-column grid. Tablet: 3-column if space allows else 1-column stack. Mobile: single column stack, full width.

### How It Works (4 steps)
- Keep numbered structure; restyle numbers using Display/H2 type in `--color-accent`, not decorative badges.
- Desktop: could be a horizontal 4-step layout with connecting line, or vertical list — vertical list recommended for clarity given step 2 has long pricing text that won't fit well horizontally.

### Matching methodology blurb
- Keep as a short, reading-width-constrained (680px) text block, left-aligned (not centered, per audit's "avoid centered long paragraphs").

### Pricing section
- Two cards (Basic/Premium) using card tokens; Premium gets the "Lagula talin" (Recommended) badge treatment from `DESIGN_SYSTEM.md`.
- **Consolidate repeated pricing mentions** (audit Finding 14b): state full figures once, clearly, in this section; elsewhere (hero, footer, step 2) use a short reference + link to `/pricing` rather than restating all four numbers each time.
- Ensure gender-based pricing difference (men vs. women pricing tiers) is displayed clearly and without ambiguity — this is central information, not fine print.

### "Need personal guidance" WhatsApp CTA
- Keep; style as its own bordered panel with WhatsApp icon, `--color-accent` primary button linking to the existing `wa.me` link.

### FAQ (partial on homepage)
- Keep 4 questions shown, "Eeg dhammaan su'aalaha" link to full `/faq`. Ensure accordion is keyboard operable (`Enter`/`Space` to toggle, `aria-expanded` state, focus-visible ring).

### Final CTA band
- Keep; ensure only one primary button here (Register), pricing link styled as secondary.

**Acceptance criteria (whole homepage):** Passes Lighthouse Performance ≥ 90 mobile (verify against current baseline first — Cursor should record before/after), Accessibility ≥ 95, no CLS from images/fonts, all sections keyboard-navigable, hero LCP element (headline or image, whichever qualifies) loads without render-blocking font/script delay.
**Testing:** Test at 375px, 768px, 1024px, 1440px; run `next build`; run Lighthouse; manual keyboard pass; verify EN toggle switches all homepage copy if functional.

---

## Stage 4 — About, How It Works, Pricing, FAQ, Contact pages

**Priority:** High
**Files:** `/about`, `/how-it-works`, `/pricing`, `/faq`, `/contact` routes

- Apply the same token system, container widths, and card/button styles for consistency across every page — this is the core fix for audit Finding "design consistency."
- `/faq`: full accordion, same interaction spec as homepage partial FAQ; add search/filter only if the question count is large enough to warrant it (confirm actual count in Stage 0).
- `/pricing`: single authoritative source of pricing truth; other pages should link here rather than restating figures.
- `/contact`: replace Cloudflare-obfuscated email display with a clean, human-readable contact block (email + WhatsApp number, both as tappable links: `mailto:` and `wa.me`), styled as a simple contact card, not just inline footer text.
- `/about`: candidate location for real success-story / trust content if available (see Stage 3 Trust section) — do not duplicate structure, link between them.

**Acceptance criteria:** Every page uses identical header/footer/type/color/spacing tokens; no page introduces a one-off style not defined in `DESIGN_SYSTEM.md`.
**Testing:** Visual diff pass across all pages at 3 breakpoints; confirm no orphaned old CSS classes remain.

---

## Stage 5 — Register & Login forms

**Priority:** High
**Files:** `/register`, `/login` routes and form components

- Apply form tokens from `DESIGN_SYSTEM.md` §4 (labels, focus states, error states).
- Confirm `?plan=basic` / `?plan=premium` query param handling still works and clearly reflects the selected plan back to the user on the registration page (e.g., a small confirmation chip: "Plan: Premium — $20").
- Ensure every field has a properly associated `<label>` (`for`/`id` or wrapping), error messages are announced to screen readers (`aria-live="polite"` region or `aria-describedby` linking input to error text), and password fields (if present) have visible show/hide toggles with accessible labels.
- Preserve all existing form submission logic, API calls, and validation rules exactly — this stage is visual/accessibility only, not a functional rewrite, unless a functional bug is discovered (flag it, don't fix silently).

**Acceptance criteria:** Form is fully operable via keyboard alone; all errors are both visually and programmatically associated with their field; existing submission functionality unchanged (verify via manual test of a full register flow in a dev environment).
**Testing:** Manual keyboard-only completion of registration flow; screen reader spot-check (VoiceOver or NVDA) on error states.

---

## Stage 6 — Footer

**Priority:** Medium
**Files:** Footer component

- Restyle using token system; keep existing structure (Quick Links / Support / Contact / final CTA / copyright) as it's already reasonably organized.
- Fix email display (Stage 4 contact fix applies here too if the same obfuscated link appears in the footer).
- Ensure footer link groups have proper heading structure (`<h3>` or similar, not just bold text) for screen reader navigation.

**Acceptance criteria:** Footer passes the same accessibility and consistency checks as the rest of the site.

---

## Stage 7 — Final cross-cutting pass

**Priority:** Critical (final gate before shipping)
- Run full accessibility audit (axe or Lighthouse) on every route.
- Confirm no horizontal overflow at any breakpoint from 320px up.
- Confirm no layout shift (CLS) from font loading or images.
- Confirm all existing routes, API calls, analytics scripts, and the WhatsApp/Google Play external links still function identically to before the redesign.
- Run lint, type-check, and production build; fix all resulting errors.
- Produce a final change report: files changed, any assumptions made that need owner confirmation (especially the "[NEEDS REAL CONTENT]" trust-section flag and the EN-toggle functionality finding), and any remaining known issues.
