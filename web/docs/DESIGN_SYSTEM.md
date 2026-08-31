# DESIGN_SYSTEM.md — Hel Calafkaaga

Creative direction: **dignified, calm, trustworthy, warm, modern-editorial** — the visual register of a well-run institution (think: a respected community organization or a considered fintech, not a nightlife or dating app). Every choice below is filtered through the stated goal: **build trust and credibility** with a bilingual Somali/English, Muslim, largely mobile audience.

Avoid: neon/saturated startup gradients, heavy drop shadows, excessive rounded "bubbly" corners, stock-photo clichés, cluttered card grids, low-contrast decorative text, centered long-form paragraphs.

---

## 1. Colour palette

A restrained, two-neutral + one-accent-family system. Deep teal-green reads as calm, trustworthy, and has natural resonance with Islamic visual tradition without being a literal cliché (no crescent/mosque iconography needed). Warm neutrals avoid the "cold SaaS" feeling.

| Token | Name | Hex | Use case |
|---|---|---|---|
| `--color-bg` | Warm Ivory | `#FBF8F3` | Page background |
| `--color-bg-secondary` | Soft Sand | `#F1EBE1` | Section alternation, card backgrounds |
| `--color-text-primary` | Deep Charcoal | `#26241F` | Primary text (headlines, body) |
| `--color-text-secondary` | Warm Stone | `#5C594F` | Secondary text, captions, metadata |
| `--color-accent` | Deep Teal | `#0F4C42` | Primary CTAs, active nav, links, key emphasis |
| `--color-accent-hover` | Teal Deep Hover | `#0A3A32` | Hover/active state of accent elements |
| `--color-accent-soft` | Teal Mist | `#E4EEEC` | Accent backgrounds (badges, highlighted panels) |
| `--color-gold` | Muted Gold | `#B8925A` | Sparing use only — small accents, dividers, "Premium" plan marker. Never for body text or large fills. |
| `--color-border` | Hairline Stone | `#DFD8CA` | Borders, dividers, input outlines |
| `--color-form-bg` | Pure White | `#FFFFFF` | Form field backgrounds, elevated surfaces |
| `--color-success` | Muted Green | `#2F6B4F` | Success states (confirmation, valid input) |
| `--color-error` | Muted Terracotta | `#B5433A` | Error states, validation messages |
| `--color-overlay` | Charcoal Overlay | `rgba(38,36,31,0.55)` | Image overlays (hero text legibility), modal backdrops |

**Accessible pairings (WCAG AA, verify with final font weights):**
- `--color-text-primary` (#26241F) on `--color-bg` (#FBF8F3) → contrast ≈ 14.8:1 ✅
- `--color-text-secondary` (#5C594F) on `--color-bg` (#FBF8F3) → contrast ≈ 6.4:1 ✅ (AA for body text)
- White (#FFFFFF) on `--color-accent` (#0F4C42) → contrast ≈ 8.7:1 ✅ (buttons)
- `--color-accent` (#0F4C42) on `--color-bg` (#FBF8F3) → contrast ≈ 8.1:1 ✅ (links)
- **Do not** place body text in `--color-gold` on `--color-bg` — contrast fails AA (~2.1:1). Gold is decorative/accent-object only, never text on light background at body size.

**Hero overlay rule:** whatever photo is used behind hero text, apply `--color-overlay` at sufficient opacity (test at 45–65%) so white/ivory hero text maintains ≥4.5:1 contrast against the busiest region of the image, not just the average.

---

## 2. Typography

**Pairing:** a refined serif for display/headings (conveys editorial, considered, institutional trust) + a highly legible humanist sans for body/UI (conveys clarity, modernity, ease of reading in two languages/scripts of Latin origin).

- **Display/Heading font:** `"Fraunces"` (Google Fonts / Fontsource) — warm, slightly editorial serif, good at large sizes, avoids the overused "luxury wedding" serifs (Playfair Display) while still reading premium.
- **Body/UI font:** `"Inter"` (Google Fonts / Fontsource) — excellent Latin-script legibility at small sizes, wide language support, well-tested for UI use, free and open license.

Both are open-source and available via Google Fonts, Fontsource, or `next/font` if the project is Next.js (confirmed by the `_next/image` paths seen on the live site) — use `next/font/google` for both to get automatic self-hosting, `font-display: swap`, and no layout shift, rather than a render-blocking `<link>` tag. **[VERIFY IN CODE]** current font loading method before replacing.

### Type scale (fluid, `clamp()`)

All sizes tested against representative long-form Somali strings, not just short English placeholders.

| Style | Font | Desktop | Mobile | Weight | Line height | Letter spacing | Transform |
|---|---|---|---|---|---|---|---|
| Display | Fraunces | `clamp(2.5rem, 4vw + 1rem, 3.75rem)` | `clamp(1.85rem, 6vw, 2.5rem)` | 500 | 1.1 | -0.01em | none |
| H1 | Fraunces | `clamp(2rem, 3vw + 1rem, 3rem)` | `clamp(1.6rem, 5vw, 2.1rem)` | 500 | 1.15 | -0.01em | none |
| H2 | Fraunces | `clamp(1.5rem, 2vw + 1rem, 2.25rem)` | `clamp(1.35rem, 4vw, 1.7rem)` | 500 | 1.2 | 0 | none |
| H3 | Inter | `clamp(1.15rem, 1vw + 0.9rem, 1.375rem)` | `1.125rem` | 600 | 1.3 | 0 | none |
| Body | Inter | `1.0625rem` (17px) | `1rem` (16px) | 400 | 1.6 | 0 | none |
| Navigation | Inter | `0.9375rem` | `1rem` (mobile menu) | 500 | 1.4 | 0.01em | none |
| Button | Inter | `0.9375rem` | `1rem` | 600 | 1 | 0.01em | none |
| Caption | Inter | `0.8125rem` | `0.8125rem` | 400 | 1.5 | 0 | none |
| Form label | Inter | `0.875rem` | `0.875rem` | 600 | 1.4 | 0 | none |

Rationale for size floor at 16px on mobile body/inputs: prevents iOS Safari auto-zoom on input focus and keeps Somali diacritic-free Latin text comfortably legible.

Never render body text below 14px anywhere (violates the audit's "tiny text" concern and hurts an older or less digitally-fluent user segment, likely present in this audience).

---

## 3. Layout system

| Token | Value |
|---|---|
| Max container width | `1200px` |
| Reading-width container (FAQ answers, About body copy) | `680px` |
| Desktop gutters | `48px` |
| Tablet gutters | `32px` |
| Mobile gutters | `20px` |
| Section vertical spacing (desktop) | `96px` top/bottom |
| Section vertical spacing (tablet) | `72px` |
| Section vertical spacing (mobile) | `56px` |
| Border radius — cards/panels | `12px` |
| Border radius — buttons/inputs | `8px` |
| Border radius — pills/badges | `999px` (only for small status badges like "Premium") |
| Border style | `1px solid var(--color-border)`, no default drop shadows on static cards |
| Shadow — resting card | none (use border instead, per "avoid heavy shadows") |
| Shadow — elevated (dropdown, modal) | `0 8px 24px rgba(38,36,31,0.12)` only |
| Animation duration | `180ms` (micro), `280ms` (panel/menu transitions) |
| Animation easing | `cubic-bezier(0.4, 0, 0.2, 1)` |

**Breakpoints:**
- Mobile: `< 640px`
- Tablet: `640px – 1023px`
- Desktop: `≥ 1024px`
- Wide: `≥ 1440px` (container stays at max-width, extra space becomes side margin)

### Spacing scale (base unit 4px)

`4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128` (px) — expose as `--space-1` through `--space-13` tokens; every margin/padding in the codebase should map to one of these, no arbitrary values.

**Grid behaviour:** content sections use a single-column stack on mobile; 2–3 column grids on tablet/desktop only where content is genuinely parallel (e.g., the 3 value-prop cards, 2 pricing cards). Never force asymmetric content into equal-width cards just for grid tidiness.

---

## 4. Component tokens

### Buttons
- **Primary** (Register-type actions only): solid `--color-accent` fill, white text, `8px` radius, `14px 28px` padding (desktop), `13px 22px` (mobile), hover → `--color-accent-hover`, focus → 2px outline offset 2px in `--color-accent` at 100% opacity plus a visible box-shadow ring for non-outline-supporting contexts.
- **Secondary**: transparent fill, `1.5px solid var(--color-accent)` border, `--color-accent` text, hover → `--color-accent-soft` background fill.
- **Tertiary/text link**: no border/fill, `--color-accent` text, underline on hover only (not resting state, to reduce visual noise), focus-visible gets full underline + outline.
- One primary button per viewport section maximum — never two competing solid CTAs side by side.

### Cards (value-prop, pricing, FAQ)
- `--color-form-bg` or `--color-bg-secondary` background, `1px solid var(--color-border)`, `12px` radius, no shadow at rest. Pricing "recommended" card gets a `2px solid var(--color-accent)` border and a small gold-accented "Lagula talin" (Recommended) badge — badge only, not a full gold card fill.

### Forms
- Inputs: `--color-form-bg` background, `1px solid var(--color-border)`, `8px` radius, `12px 16px` padding, `16px` font-size minimum, focus → `1.5px solid var(--color-accent)` + soft `--color-accent-soft` outer glow, error → `1.5px solid var(--color-error)` with error message in `--color-error` beneath field (not just red border — always pair color with text for colorblind users).
- Labels always visible above field (never placeholder-as-label).

### Badges
- Plan/status badges use `999px` radius, `--color-accent-soft` background + `--color-accent` text for neutral badges; gold variant reserved for "Premium" labeling only.

---

## 5. Accessibility baseline (applies to every component above)
- All interactive elements: visible `:focus-visible` state, never `outline: none` without a replacement.
- Color is never the only signal (pair with icon/text for success/error).
- Motion: wrap all transitions/animations in `@media (prefers-reduced-motion: no-preference)`; provide instant-state fallback otherwise.
- Minimum tap target: `44×44px` on touch viewports.
