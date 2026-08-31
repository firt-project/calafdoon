#!/usr/bin/env node
/**
 * Legacy Convex Stripe setup — removed.
 * Set on Nest API (Render):
 *   STRIPE_SECRET_KEY=sk_live_...
 *   STRIPE_WEBHOOK_SECRET=whsec_...
 *   STRIPE_PUBLISHABLE_KEY / NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY on Vercel
 */
console.error(
  "setup-stripe.mjs no longer uses Convex.\nSet STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET on the Nest API (Render) environment."
);
process.exit(1);
