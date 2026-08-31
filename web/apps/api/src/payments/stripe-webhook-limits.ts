/**
 * Stripe webhook abuse controls (M5).
 * Generous defaults — Stripe retries/bursts must not be rejected casually.
 */

function positiveInt(raw: string | undefined, fallback: number, max?: number): number {
  const n = Number(raw ?? fallback);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  if (max != null) return Math.min(Math.floor(n), max);
  return Math.floor(n);
}

/** Max raw webhook body (default 256 KiB, hard-capped at 1 MiB). */
export function stripeWebhookMaxBodyBytes(): number {
  return positiveInt(process.env.STRIPE_WEBHOOK_MAX_BODY_BYTES, 256 * 1024, 1024 * 1024);
}

export function stripeWebhookIpRateLimit(): { windowSec: number; max: number } {
  return {
    windowSec: positiveInt(process.env.STRIPE_WEBHOOK_RATE_IP_WINDOW_SEC, 60),
    max: positiveInt(process.env.STRIPE_WEBHOOK_RATE_IP_MAX, 300),
  };
}

export function stripeWebhookGlobalRateLimit(): { windowSec: number; max: number } {
  return {
    windowSec: positiveInt(process.env.STRIPE_WEBHOOK_RATE_GLOBAL_WINDOW_SEC, 60),
    max: positiveInt(process.env.STRIPE_WEBHOOK_RATE_GLOBAL_MAX, 2000),
  };
}

export function isStripeWebhookPath(path: string): boolean {
  return path.endsWith("/webhooks/stripe");
}
