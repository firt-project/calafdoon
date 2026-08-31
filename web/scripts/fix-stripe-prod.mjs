#!/usr/bin/env node
/**
 * Legacy Convex Stripe fix — removed.
 * Edit STRIPE_SECRET_KEY on the Nest API (Render) environment directly.
 */
console.error(
  "fix-stripe-prod.mjs no longer uses Convex.\nUpdate STRIPE_SECRET_KEY on the Nest API (Render) environment."
);
process.exit(1);
