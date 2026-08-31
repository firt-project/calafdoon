import { z } from "zod";

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
    SESSION_SECRET: z.string().min(16).optional(),
    AUTH_SECRET: z.string().min(16).optional(),
    COOKIE_DOMAIN: z.string().optional(),
    COOKIE_SECURE: z.string().optional(),
    CORS_ORIGINS: z.string().optional(),
    TRUST_PROXY: z.string().optional(),
    APP_URL: z.string().optional(),
    MAIL_DRIVER: z.enum(["console", "resend", "disabled"]).default("console"),
    RESEND_API_KEY: z.string().optional(),
    RESEND_FROM: z.string().optional(),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_GATEWAY: z.enum(["live", "fake"]).optional(),
    STRIPE_ALLOW_LIVE: z.string().optional(),
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
    /** Optional Sentry DSN — never commit the real value */
    SENTRY_DSN: z.string().optional(),
    SENTRY_ENVIRONMENT: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;

    if (env.STRIPE_GATEWAY === "fake") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["STRIPE_GATEWAY"],
        message:
          "STRIPE_GATEWAY=fake is forbidden in production (would unlock paid access without payment)",
      });
    }

    if (env.MAIL_DRIVER === "console") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MAIL_DRIVER"],
        message: "MAIL_DRIVER=console is forbidden in production",
      });
    }

    const sessionSecret = env.SESSION_SECRET ?? env.AUTH_SECRET ?? "";
    if (sessionSecret.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SESSION_SECRET"],
        message:
          "SESSION_SECRET (or AUTH_SECRET) must be at least 32 characters in production",
      });
    }

    if (!env.CORS_ORIGINS?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CORS_ORIGINS"],
        message: "CORS_ORIGINS is required in production (comma-separated HTTPS origins)",
      });
    }

    if (!env.APP_URL?.trim() || !/^https:\/\//i.test(env.APP_URL)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["APP_URL"],
        message: "APP_URL must be an https:// URL in production",
      });
    }

    if (!env.S3_ACCESS_KEY_ID?.trim() || !env.S3_SECRET_ACCESS_KEY?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["S3_ACCESS_KEY_ID"],
        message: "S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required in production",
      });
    }

    if (env.STRIPE_GATEWAY === "live" && !env.STRIPE_SECRET_KEY?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["STRIPE_SECRET_KEY"],
        message: "STRIPE_SECRET_KEY is required when STRIPE_GATEWAY=live",
      });
    }

    if (env.MAIL_DRIVER === "resend" && !env.RESEND_API_KEY?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["RESEND_API_KEY"],
        message: "RESEND_API_KEY is required when MAIL_DRIVER=resend",
      });
    }

    if (env.REDIS_URL.includes("localhost") || env.REDIS_URL.includes("127.0.0.1")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["REDIS_URL"],
        message:
          "REDIS_URL must not point at localhost in production — use the managed Redis hostname",
      });
    }

    if (
      env.DATABASE_URL.includes("localhost") ||
      env.DATABASE_URL.includes("127.0.0.1")
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATABASE_URL"],
        message:
          "DATABASE_URL must not point at localhost in production — use the managed Postgres hostname",
      });
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): AppEnv {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${details}`);
  }
  return parsed.data;
}
