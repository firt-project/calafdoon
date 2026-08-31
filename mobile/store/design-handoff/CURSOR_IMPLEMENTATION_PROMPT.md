You are implementing a redesign of the Hel Calafkaaga website (a Somali-language Islamic matrimonial/matchmaking platform, with an English toggle). Three planning documents are in this repository root: `DESIGN_AUDIT.md`, `DESIGN_SYSTEM.md`, and `REDESIGN_IMPLEMENTATION.md`. Read all three fully before writing any code.

**Important context:** these documents were written from outside the codebase, based only on the live rendered site. They are a strong starting plan, not ground truth about the actual code. Your first job is to verify, correct, or discard specific claims in them against the real repository — file paths, framework details, whether the EN/Somali toggle is functional, exact current colors/fonts, and anything marked **[VERIFY IN CODE]** or **[NEEDS REAL CONTENT]**. Where the documents are wrong about the codebase, follow the actual code and note the correction in your final report — don't force the code to match a wrong assumption in the docs.

**The stated redesign goal is trust and credibility for a bilingual (Somali/English), Muslim, mobile-leaning audience** — prioritize this over generic visual polish when the two are in tension.

## Do this in order:

1. **Inspect the repository.** Identify the framework, styling system, routing structure, i18n implementation, and every route listed in `REDESIGN_IMPLEMENTATION.md` Stage 0. Report what you find and correct any wrong assumptions in the planning docs before proceeding.

2. **Implement in stages, in the order laid out in `REDESIGN_IMPLEMENTATION.md`** (Stage 1: design tokens → Stage 2: header/nav → Stage 3: homepage → Stage 4: secondary pages → Stage 5: register/login forms → Stage 6: footer → Stage 7: final pass). Complete and verify each stage before moving to the next.

3. **Preserve all existing functionality exactly**, including: all routes, all API calls and data flows, the registration/login logic and its `?plan=` query param handling, analytics/tracking scripts, the WhatsApp (`wa.me`) and Google Play links, SEO metadata (title, meta description, Open Graph tags, canonical URL), and the EN/Somali language toggle's actual behavior (fix its styling, don't break or silently change its logic — if you find it's non-functional, flag this loudly in your report rather than quietly leaving it broken).

4. **Do not fabricate content.** Where the implementation plan calls for real statistics, testimonials, or success-story content that doesn't currently exist in the codebase or CMS, implement the structure and use only honest, currently-true copy (e.g., qualitative descriptions of the vetting process) — mark the spot clearly with a `{/* TODO: real stat needed */}`-style comment rather than inventing numbers.

5. **Test every viewport** at minimum 375px, 768px, 1024px, and 1440px widths after each stage. Confirm no horizontal overflow, no layout shift, and correct behavior of the mobile navigation (open, keyboard trap-free, Escape closes, focus returns correctly, scroll locks while open).

6. **Meet the accessibility bar in `REDESIGN_IMPLEMENTATION.md` Stage 7** — WCAG AA contrast, semantic HTML, logical heading order, full keyboard operability, visible focus states, proper form labels/error association, `prefers-reduced-motion` support throughout.

7. **Before finishing, run and fix all issues from:** linting, type checking, the test suite (if one exists), and a full production build. Do not consider a stage complete if any of these fail.

8. **Report back with:**
   - A list of every file you changed or created, grouped by stage.
   - Any corrections you made to the assumptions in `DESIGN_AUDIT.md`, `DESIGN_SYSTEM.md`, or `REDESIGN_IMPLEMENTATION.md` after seeing the real code.
   - Any content gaps you flagged with TODOs instead of fabricating.
   - Any remaining known issues, and anything you were unable to verify (e.g., a form flow you couldn't fully test without live credentials).
   - Confirmation of the four checks in step 7 (lint, type-check, tests, build) all passing.

Work stage by stage, verify as you go, and don't move to the next stage with a known-broken previous stage.
