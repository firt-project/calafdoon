#!/usr/bin/env node
/**
 * Legacy Convex setup script — removed.
 * Configure Resend on the Nest API host (Render) instead:
 *   MAIL_DRIVER=resend
 *   AUTH_RESEND_KEY=re_...
 *   AUTH_EMAIL_FROM="Calaf <support@helcalafkaaga.com>"
 *   SUPPORT_EMAIL=support@helcalafkaaga.com
 */
console.error(
  "setup-resend.mjs no longer uses Convex.\nSet AUTH_RESEND_KEY / AUTH_EMAIL_FROM / SUPPORT_EMAIL on the Nest API (Render) environment."
);
process.exit(1);
