#!/usr/bin/env node
/**
 * Production deploy checklist (Nest API + Next.js).
 */

const steps = [
  ["1. Nest API (Render)", "Deploy apps/api; confirm Prisma migrate + /health"],
  [
    "2. Cookies + CORS on API",
    "COOKIE_SECURE=true, COOKIE_SAMESITE=lax, TRUST_PROXY=true, COOKIE_DOMAIN unset; CORS_ORIGINS=www+apex",
  ],
  [
    "3. Vercel same-origin proxy (Safari fix)",
    "NEXT_PUBLIC_API_URL=/backend, API_UPSTREAM_URL=https://api.example.com, omit SOCKET or same-origin (see infra/staging/vercel-api-mode.env.example)",
  ],
  [
    "4. Stripe webhook",
    "Point Stripe webhook at the Nest host (onrender or api.web.example.com) — not the Vercel /backend path",
  ],
  [
    "5. Stripe / email secrets on API",
    "STRIPE_* + Resend/mail env on Render",
  ],
  ["6. Redeploy frontend", "Vercel Redeploy after changing NEXT_PUBLIC_* / API_UPSTREAM_URL"],
  [
    "7. Smoke test (iPhone Safari)",
    "Login → hel_session on web.example.com → /auth/me → reload; Socket.IO polling on same host",
  ],
  [
    "8. Optional later",
    "Custom domain api.web.example.com; then NEXT_PUBLIC_API_URL/SOCKET_URL can switch off /backend proxy",
  ],
];

console.log("Calaf production checklist\n");
for (const [title, detail] of steps) {
  console.log(`☐ ${title}`);
  console.log(`   ${detail}\n`);
}
