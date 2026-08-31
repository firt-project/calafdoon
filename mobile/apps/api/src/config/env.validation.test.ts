import { describe, expect, it } from "node:test";
import assert from "node:assert/strict";
import { validateEnv } from "../config/env.validation";

describe("production env validation", () => {
  it("rejects STRIPE_GATEWAY=fake in production", () => {
    assert.throws(
      () =>
        validateEnv({
          NODE_ENV: "production",
          DATABASE_URL: "postgresql://u:p@db.internal/hel",
          REDIS_URL: "redis://redis.internal:6379",
          SESSION_SECRET: "x".repeat(32),
          STRIPE_GATEWAY: "fake",
          MAIL_DRIVER: "resend",
          RESEND_API_KEY: "re_x",
          CORS_ORIGINS: "https://app.example.com",
          APP_URL: "https://app.example.com",
          S3_ACCESS_KEY_ID: "key",
          S3_SECRET_ACCESS_KEY: "secret",
        }),
      /STRIPE_GATEWAY=fake/
    );
  });

  it("accepts live stripe + resend with strong session secret", () => {
    const env = validateEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://u:p@db.internal/hel",
      REDIS_URL: "redis://redis.internal:6379",
      SESSION_SECRET: "x".repeat(32),
      STRIPE_GATEWAY: "live",
      STRIPE_SECRET_KEY: "sk_live_replace",
      MAIL_DRIVER: "resend",
      RESEND_API_KEY: "re_test",
      CORS_ORIGINS: "https://app.example.com",
      APP_URL: "https://app.example.com",
      S3_ACCESS_KEY_ID: "AKIAEXAMPLE",
      S3_SECRET_ACCESS_KEY: "secret",
    });
    assert.equal(env.STRIPE_GATEWAY, "live");
  });

  it("rejects localhost DATABASE_URL in production", () => {
    assert.throws(
      () =>
        validateEnv({
          NODE_ENV: "production",
          DATABASE_URL: "postgresql://u:p@localhost/hel",
          REDIS_URL: "redis://redis.internal:6379",
          SESSION_SECRET: "x".repeat(32),
          STRIPE_GATEWAY: "live",
          STRIPE_SECRET_KEY: "sk_live_x",
          MAIL_DRIVER: "resend",
          RESEND_API_KEY: "re_x",
          CORS_ORIGINS: "https://app.example.com",
          APP_URL: "https://app.example.com",
          S3_ACCESS_KEY_ID: "key",
          S3_SECRET_ACCESS_KEY: "secret",
        }),
      /DATABASE_URL/
    );
  });

  it("allows fake stripe in development", () => {
    const env = validateEnv({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://u:p@db/hel",
      STRIPE_GATEWAY: "fake",
      MAIL_DRIVER: "console",
    });
    assert.equal(env.STRIPE_GATEWAY, "fake");
  });
});
