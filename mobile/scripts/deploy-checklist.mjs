#!/usr/bin/env node
/**
 * Production deploy checklist (Nest API + Next.js).
 */

const steps = [
  ["1. Nest API (Render)", "Deploy apps/api; confirm Prisma migrate + /health"],
  [
    "2. Stripe webhook",
    "Point Stripe webhook to https://YOUR-API-HOST/webhooks/stripe (checkout.session.completed)",
  ],
  [
    "3. Stripe secrets on API",
    "Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET on Render",
  ],
  [
    "4. Email on API",
    "Set AUTH_RESEND_KEY / AUTH_EMAIL_FROM / SUPPORT_EMAIL (or MAIL_DRIVER) on Render",
  ],
  [
    "5. Vercel frontend env",
    "NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SOCKET_URL (see infra/staging/vercel-api-mode.env.example)",
  ],
  [
    "6. CORS on API",
    "CORS_ORIGINS must include www + apex + any Vercel preview URLs",
  ],
  ["7. Redeploy frontend", "Vercel Redeploy after changing NEXT_PUBLIC_* vars"],
  ["8. Smoke test", "Login, profile photo, chat, payment status"],
];

console.log("Calaf production checklist\n");
for (const [title, detail] of steps) {
  console.log(`☐ ${title}`);
  console.log(`   ${detail}\n`);
}
