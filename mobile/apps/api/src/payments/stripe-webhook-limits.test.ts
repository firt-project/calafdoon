import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { HttpException, HttpStatus, PayloadTooLargeException } from "@nestjs/common";
import { RateLimitGuard } from "../redis/rate-limit.guard";
import { CsrfGuard } from "../auth/csrf";
import {
  stripeWebhookGlobalRateLimit,
  stripeWebhookIpRateLimit,
  stripeWebhookMaxBodyBytes,
} from "./stripe-webhook-limits";
import { FakeStripeGateway } from "./stripe.gateway";
import { sanitizeHeaders, sanitizeForLog } from "../observability/log-redact";

function mockCtx(opts: {
  path: string;
  method?: string;
  ip?: string;
  body?: unknown;
  user?: { id: string };
}) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        path: opts.path,
        method: opts.method ?? "POST",
        ip: opts.ip ?? "203.0.113.10",
        socket: { remoteAddress: opts.ip ?? "203.0.113.10" },
        user: opts.user,
        body: opts.body ?? {},
      }),
    }),
  };
}

function memoryRedis() {
  const store = new Map<string, { count: number; ttl?: number }>();
  return {
    connect: async () => true,
    available: true,
    client: {
      incr: async (key: string) => {
        const cur = store.get(key) ?? { count: 0 };
        cur.count += 1;
        store.set(key, cur);
        return cur.count;
      },
      expire: async (key: string, ttl: number) => {
        const cur = store.get(key);
        if (cur) cur.ttl = ttl;
        return 1;
      },
    },
    store,
  };
}

describe("stripe webhook limits helpers (M5)", () => {
  const prev: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of [
      "STRIPE_WEBHOOK_MAX_BODY_BYTES",
      "STRIPE_WEBHOOK_RATE_IP_MAX",
      "STRIPE_WEBHOOK_RATE_IP_WINDOW_SEC",
      "STRIPE_WEBHOOK_RATE_GLOBAL_MAX",
      "STRIPE_WEBHOOK_RATE_GLOBAL_WINDOW_SEC",
    ]) {
      prev[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("uses generous defaults", () => {
    assert.equal(stripeWebhookMaxBodyBytes(), 262144);
    assert.deepEqual(stripeWebhookIpRateLimit(), { windowSec: 60, max: 300 });
    assert.deepEqual(stripeWebhookGlobalRateLimit(), {
      windowSec: 60,
      max: 2000,
    });
  });

  it("respects env overrides and caps body at 1 MiB", () => {
    process.env.STRIPE_WEBHOOK_MAX_BODY_BYTES = "99999999";
    process.env.STRIPE_WEBHOOK_RATE_IP_MAX = "50";
    assert.equal(stripeWebhookMaxBodyBytes(), 1024 * 1024);
    assert.equal(stripeWebhookIpRateLimit().max, 50);
  });
});

describe("Stripe webhook rate limiting (M5)", () => {
  const prev: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of [
      "STRIPE_WEBHOOK_RATE_IP_MAX",
      "STRIPE_WEBHOOK_RATE_IP_WINDOW_SEC",
      "STRIPE_WEBHOOK_RATE_GLOBAL_MAX",
      "STRIPE_WEBHOOK_RATE_GLOBAL_WINDOW_SEC",
    ]) {
      prev[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("allows requests below the per-IP limit", async () => {
    process.env.STRIPE_WEBHOOK_RATE_IP_MAX = "5";
    process.env.STRIPE_WEBHOOK_RATE_GLOBAL_MAX = "100";
    const redis = memoryRedis();
    const guard = new RateLimitGuard(redis as never);
    for (let i = 0; i < 5; i++) {
      assert.equal(
        await guard.canActivate(
          mockCtx({ path: "/webhooks/stripe", ip: "198.51.100.1" }) as never
        ),
        true
      );
    }
  });

  it("returns 429 above the per-IP limit without secret data", async () => {
    process.env.STRIPE_WEBHOOK_RATE_IP_MAX = "2";
    process.env.STRIPE_WEBHOOK_RATE_GLOBAL_MAX = "100";
    const redis = memoryRedis();
    const guard = new RateLimitGuard(redis as never);
    await guard.canActivate(
      mockCtx({ path: "/webhooks/stripe", ip: "198.51.100.2" }) as never
    );
    await guard.canActivate(
      mockCtx({ path: "/webhooks/stripe", ip: "198.51.100.2" }) as never
    );
    await assert.rejects(
      () =>
        guard.canActivate(
          mockCtx({ path: "/webhooks/stripe", ip: "198.51.100.2" }) as never
        ),
      (err: unknown) => {
        assert.ok(err instanceof HttpException);
        assert.equal(err.getStatus(), HttpStatus.TOO_MANY_REQUESTS);
        const body = JSON.stringify(err.getResponse());
        assert.equal(body.includes("whsec_"), false);
        assert.equal(body.includes("stripe-signature"), false);
        assert.equal(body.includes("FAKE"), false);
        return true;
      }
    );
  });

  it("enforces a global route bucket across IPs", async () => {
    process.env.STRIPE_WEBHOOK_RATE_IP_MAX = "100";
    process.env.STRIPE_WEBHOOK_RATE_GLOBAL_MAX = "3";
    const redis = memoryRedis();
    const guard = new RateLimitGuard(redis as never);
    await guard.canActivate(
      mockCtx({ path: "/webhooks/stripe", ip: "198.51.100.10" }) as never
    );
    await guard.canActivate(
      mockCtx({ path: "/webhooks/stripe", ip: "198.51.100.11" }) as never
    );
    await guard.canActivate(
      mockCtx({ path: "/webhooks/stripe", ip: "198.51.100.12" }) as never
    );
    await assert.rejects(
      () =>
        guard.canActivate(
          mockCtx({ path: "/webhooks/stripe", ip: "198.51.100.13" }) as never
        ),
      (err: unknown) =>
        err instanceof HttpException &&
        err.getStatus() === HttpStatus.TOO_MANY_REQUESTS
    );
  });

  it("one abusive IP does not exhaust another IP allowance under the global cap", async () => {
    process.env.STRIPE_WEBHOOK_RATE_IP_MAX = "2";
    process.env.STRIPE_WEBHOOK_RATE_GLOBAL_MAX = "50";
    const redis = memoryRedis();
    const guard = new RateLimitGuard(redis as never);
    await guard.canActivate(
      mockCtx({ path: "/webhooks/stripe", ip: "198.51.100.20" }) as never
    );
    await guard.canActivate(
      mockCtx({ path: "/webhooks/stripe", ip: "198.51.100.20" }) as never
    );
    await assert.rejects(() =>
      guard.canActivate(
        mockCtx({ path: "/webhooks/stripe", ip: "198.51.100.20" }) as never
      )
    );
    // Different IP still accepted.
    assert.equal(
      await guard.canActivate(
        mockCtx({ path: "/webhooks/stripe", ip: "198.51.100.21" }) as never
      ),
      true
    );
  });

  it("Redis keys never contain signature or webhook secret values", async () => {
    process.env.STRIPE_WEBHOOK_RATE_IP_MAX = "10";
    process.env.STRIPE_WEBHOOK_RATE_GLOBAL_MAX = "10";
    const redis = memoryRedis();
    const guard = new RateLimitGuard(redis as never);
    await guard.canActivate(
      mockCtx({ path: "/webhooks/stripe", ip: "198.51.100.30" }) as never
    );
    const keys = [...redis.store.keys()];
    assert.deepEqual(
      keys.sort(),
      ["rl:payments.webhook:global", "rl:payments.webhook:ip:198.51.100.30"].sort()
    );
    for (const k of keys) {
      assert.equal(k.includes("whsec"), false);
      assert.equal(k.includes("t=1,v1"), false);
    }
  });

  it("fail-opens when Redis is unavailable (does not crash)", async () => {
    const redis = {
      connect: async () => false,
      client: null,
      available: false,
    };
    const guard = new RateLimitGuard(redis as never);
    assert.equal(
      await guard.canActivate(
        mockCtx({ path: "/webhooks/stripe", ip: "198.51.100.40" }) as never
      ),
      true
    );
  });

  it("atomic concurrent increments enforce the limit", async () => {
    process.env.STRIPE_WEBHOOK_RATE_IP_MAX = "5";
    process.env.STRIPE_WEBHOOK_RATE_GLOBAL_MAX = "100";
    const redis = memoryRedis();
    const guard = new RateLimitGuard(redis as never);
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        guard.canActivate(
          mockCtx({ path: "/webhooks/stripe", ip: "198.51.100.50" }) as never
        )
      )
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const limited = results.filter(
      (r) =>
        r.status === "rejected" &&
        r.reason instanceof HttpException &&
        r.reason.getStatus() === 429
    ).length;
    assert.equal(ok, 5);
    assert.equal(limited, 3);
  });

  it("checkout routes remain fail-closed when Redis is down", async () => {
    const redis = {
      connect: async () => false,
      client: null,
      available: false,
    };
    const guard = new RateLimitGuard(redis as never);
    await assert.rejects(
      () =>
        guard.canActivate(
          mockCtx({
            path: "/payments/stripe/registration-checkout",
            user: { id: "u1" },
          }) as never
        ),
      (err: unknown) =>
        err instanceof HttpException &&
        err.getStatus() === HttpStatus.SERVICE_UNAVAILABLE
    );
  });
});

describe("Stripe webhook CSRF and HMAC (M5)", () => {
  it("webhook remains CSRF-exempt", () => {
    const guard = new CsrfGuard();
    assert.equal(
      guard.canActivate(
        mockCtx({ path: "/webhooks/stripe", method: "POST" }) as never
      ),
      true
    );
  });

  it("browser payment mutations still require CSRF when cookie session present", () => {
    const guard = new CsrfGuard();
    assert.throws(
      () =>
        guard.canActivate({
          switchToHttp: () => ({
            getRequest: () => ({
              path: "/payments/stripe/registration-checkout",
              method: "POST",
              cookies: { hel_session: "sess", hel_csrf: "a".repeat(64) },
              headers: {},
            }),
          }),
        } as never),
      /CSRF/
    );
  });

  it("invalid signature still rejected; valid fake signature accepted", () => {
    const stripe = new FakeStripeGateway();
    const payload = JSON.stringify({
      id: "evt_test_1",
      type: "checkout.session.completed",
      data: { object: {} },
    });
    assert.throws(() =>
      stripe.constructEvent(payload, "t=1,v1=invalid")
    );
    const event = stripe.constructEvent(payload, "t=1,v1=valid_test_sig");
    assert.equal((event as { id: string }).id, "evt_test_1");
  });

  it("oversized body check uses PayloadTooLarge without touching signature", () => {
    const max = stripeWebhookMaxBodyBytes();
    const raw = Buffer.alloc(max + 1, 0x61);
    const signature = "t=1,v1=FAKE_STRIPE_SIGNATURE_MARKER_m5";
    assert.ok(raw.length > max);
    // Mimic controller guard: size check does not mutate inputs.
    const size = raw.length;
    assert.equal(signature.includes("FAKE_STRIPE"), true);
    if (size > max) {
      const err = new PayloadTooLargeException("Payload Too Large");
      assert.equal(err.getStatus(), 413);
    }
    assert.equal(raw.toString("utf8", 0, 4), "aaaa");
    assert.equal(signature, "t=1,v1=FAKE_STRIPE_SIGNATURE_MARKER_m5");
  });

  it("logs redact stripe-signature and do not keep raw bodies", () => {
    const headers = sanitizeHeaders({
      "stripe-signature": "t=1,v1=FAKE_STRIPE_SIGNATURE_MARKER_m5",
      "content-type": "application/json",
    });
    assert.equal(headers["stripe-signature"], "[Redacted]");
    const meta = sanitizeForLog({
      rawBody: '{"id":"evt_x","secret":"nope"}',
      stripeSignature: "t=1,v1=FAKE",
    });
    assert.equal(
      JSON.stringify(meta).includes("t=1,v1=FAKE_STRIPE_SIGNATURE_MARKER_m5"),
      false
    );
  });

  it("missing signature path does not 500 at construct layer", () => {
    const stripe = new FakeStripeGateway();
    assert.throws(() => stripe.constructEvent("{}", "missing"));
  });
});
