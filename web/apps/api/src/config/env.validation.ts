import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  /** Optional; injected into REDIS_URL when the URL has no password (local Compose). */
  REDIS_PASSWORD: z.string().optional(),
  SESSION_SECRET: z.string().min(16).optional(),
  AUTH_SECRET: z.string().min(16).optional(),
  /**
   * L4: when true/1/yes/on, staff (admin/owner) without MFA get a restricted
   * session until enrollment. Default off for safe local/dev rollout.
   */
  REQUIRE_STAFF_MFA: z.string().optional(),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: z.string().optional(),
  /** lax (default / same-site) | none (cross-site) | strict */
  COOKIE_SAMESITE: z.string().optional(),
  CORS_ORIGINS: z.string().optional(),
  TRUST_PROXY: z.string().optional(),
  APP_URL: z.string().optional(),
  MAIL_DRIVER: z.enum(["console", "resend", "disabled"]).default("console"),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().optional(),
  /** Legacy Convex / Render aliases — preferred names are RESEND_*. */
  AUTH_RESEND_KEY: z.string().optional(),
  AUTH_EMAIL_FROM: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_GATEWAY: z.enum(["live", "fake"]).optional(),
  STRIPE_ALLOW_LIVE: z.string().optional(),
  /** WaafiPay API_PURCHASE — explicit names only (no generic API_KEY fallbacks). */
  WAAFI_MERCHANT_UID: z.string().optional(),
  WAAFI_API_USER_ID: z.string().optional(),
  WAAFI_API_KEY: z.string().optional(),
  /** live (default) | sandbox */
  WAAFI_ENV: z.string().optional(),
  /** Override endpoint; defaults from WAAFI_ENV. */
  WAAFI_BASE_URL: z.string().optional(),
  /** Paystack transaction API — set on the API host, never Vercel. */
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_PUBLIC_KEY: z.string().optional(),
  /** Settlement currency on your Paystack account (default USD). */
  PAYSTACK_CURRENCY: z.string().optional(),
  /** Units of PAYSTACK_CURRENCY per 1 USD — required when currency is not USD. */
  PAYSTACK_USD_RATE: z.coerce.number().positive().optional(),
  /** Comma-separated admin emails for payment alerts; defaults to staff accounts. */
  ADMIN_ALERT_EMAILS: z.string().optional(),
  /** Stripe webhook abuse controls (M5) — optional; safe defaults apply. */
  STRIPE_WEBHOOK_MAX_BODY_BYTES: z.coerce.number().int().positive().optional(),
  STRIPE_WEBHOOK_RATE_IP_MAX: z.coerce.number().int().positive().optional(),
  STRIPE_WEBHOOK_RATE_IP_WINDOW_SEC: z.coerce.number().int().positive().optional(),
  STRIPE_WEBHOOK_RATE_GLOBAL_MAX: z.coerce.number().int().positive().optional(),
  STRIPE_WEBHOOK_RATE_GLOBAL_WINDOW_SEC: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
  /** M6: reclaim processing rows older than this many ms (default 5m). */
  STRIPE_WEBHOOK_STALE_PROCESSING_MS: z.coerce.number().int().positive().optional(),
  // Local MinIO / future R2
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.string().optional(),
  S3_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  S3_BUCKET_PROFILE: z.string().default("hel-profile"),
  S3_BUCKET_PROFILE_PRIVATE: z.string().default("hel-profile-private"),
  S3_BUCKET_CHAT: z.string().default("hel-chat"),
  S3_BUCKET_SUPPORT: z.string().default("hel-support"),
  S3_BUCKET_EVC: z.string().default("hel-evc"),
});

export type AppEnv = z.infer<typeof envSchema>;

/** True when fake Stripe must never be used (public production hosts). */
export function isStripeFakeForbidden(
  env: Pick<AppEnv, "NODE_ENV"> & {
    RENDER?: unknown;
    RENDER_SERVICE_ID?: unknown;
  }
): boolean {
  return (
    env.NODE_ENV === "production" ||
    Boolean(env.RENDER) ||
    Boolean(env.RENDER_SERVICE_ID)
  );
}

export function validateEnv(config: Record<string, unknown>): AppEnv {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${details}`);
  }

  const data = parsed.data;
  if (
    data.STRIPE_GATEWAY === "fake" &&
    isStripeFakeForbidden({
      NODE_ENV: data.NODE_ENV,
      RENDER: config.RENDER,
      RENDER_SERVICE_ID: config.RENDER_SERVICE_ID,
    })
  ) {
    throw new Error(
      "Invalid environment: STRIPE_GATEWAY=fake is forbidden when NODE_ENV=production or RENDER is set. Use live Stripe with webhook signature verification."
    );
  }

  return data;
}
