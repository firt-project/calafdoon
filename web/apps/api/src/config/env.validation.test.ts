import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isStripeFakeForbidden,
  validateEnv,
} from "./env.validation";

const base = {
  DATABASE_URL: "postgresql://hel:hel@localhost:5432/hel_test",
  REDIS_URL: "redis://127.0.0.1:6379",
};

describe("validateEnv Stripe fake gateway", () => {
  it("allows STRIPE_GATEWAY=fake in development", () => {
    const env = validateEnv({
      ...base,
      NODE_ENV: "development",
      STRIPE_GATEWAY: "fake",
    });
    assert.equal(env.STRIPE_GATEWAY, "fake");
  });

  it("allows STRIPE_GATEWAY=fake in test", () => {
    const env = validateEnv({
      ...base,
      NODE_ENV: "test",
      STRIPE_GATEWAY: "fake",
    });
    assert.equal(env.STRIPE_GATEWAY, "fake");
  });

  it("rejects STRIPE_GATEWAY=fake when NODE_ENV=production", () => {
    assert.throws(
      () =>
        validateEnv({
          ...base,
          NODE_ENV: "production",
          STRIPE_GATEWAY: "fake",
        }),
      /STRIPE_GATEWAY=fake is forbidden/
    );
  });

  it("rejects STRIPE_GATEWAY=fake when RENDER is set", () => {
    assert.throws(
      () =>
        validateEnv({
          ...base,
          NODE_ENV: "development",
          RENDER: "true",
          STRIPE_GATEWAY: "fake",
        }),
      /STRIPE_GATEWAY=fake is forbidden/
    );
  });

  it("rejects STRIPE_GATEWAY=fake when RENDER_SERVICE_ID is set", () => {
    assert.throws(
      () =>
        validateEnv({
          ...base,
          NODE_ENV: "development",
          RENDER_SERVICE_ID: "srv-test",
          STRIPE_GATEWAY: "fake",
        }),
      /STRIPE_GATEWAY=fake is forbidden/
    );
  });

  it("allows live gateway in production", () => {
    const env = validateEnv({
      ...base,
      NODE_ENV: "production",
      STRIPE_GATEWAY: "live",
      SESSION_SECRET: "production-session-secret-32chars!!",
    });
    assert.equal(env.STRIPE_GATEWAY, "live");
  });

  it("isStripeFakeForbidden matches production and Render", () => {
    assert.equal(isStripeFakeForbidden({ NODE_ENV: "production" }), true);
    assert.equal(
      isStripeFakeForbidden({ NODE_ENV: "development", RENDER: "true" }),
      true
    );
    assert.equal(isStripeFakeForbidden({ NODE_ENV: "test" }), false);
  });
});
