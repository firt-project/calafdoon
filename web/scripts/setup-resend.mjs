#!/usr/bin/env node
/**
 * Legacy Convex setup script — removed.
 * Configure Resend on the Nest API host (Render) instead:
 *   MAIL_DRIVER=resend
 *   RESEND_API_KEY=re_...   (or AUTH_RESEND_KEY)
 *   RESEND_FROM="Hel Calafkaaga <noreply@helcalafkaaga.com>"
 *     (or AUTH_EMAIL_FROM — Nest accepts both)
 *   SUPPORT_EMAIL=support@helcalafkaaga.com
 */
console.error(
  "setup-resend.mjs no longer uses Convex.\nSet MAIL_DRIVER=resend plus RESEND_API_KEY/RESEND_FROM (or AUTH_RESEND_KEY/AUTH_EMAIL_FROM) on the Nest API (Render) environment."
);
process.exit(1);
