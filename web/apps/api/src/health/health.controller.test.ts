import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HttpException } from "@nestjs/common";
import { HealthController } from "./health.controller";

function makeController(opts: {
  dbUp?: boolean;
  redisUp?: boolean;
  s3Up?: boolean;
}) {
  const prisma = {
    $queryRaw: async () => {
      if (opts.dbUp === false) throw new Error("db down");
      return [{ "?column?": 1 }];
    },
  };
  const redis = {
    connect: async () => opts.redisUp !== false,
  };
  const config = {
    get: (k: string) => {
      if (k === "S3_ENDPOINT") return "http://127.0.0.1:9000";
      if (k === "S3_BUCKET_PROFILE") return "hel-profile";
      if (k === "S3_REGION") return "us-east-1";
      if (k === "S3_ACCESS_KEY_ID") return "x";
      if (k === "S3_SECRET_ACCESS_KEY") return "y";
      return undefined;
    },
  };
  const metrics = {
    snapshot: () => ({
      counters: {
        httpRequests: 1,
        httpErrors: 0,
        loginFailures: 0,
        paymentWebhookEvents: 0,
        mediaUploadFailures: 0,
        shadowMismatches: 0,
        shadowTimeouts: 0,
        shadowSamples: 0,
      },
      httpLatencyMs: { samples: 0, p50: 0, p95: 0 },
    }),
  };

  const ctl = new HealthController(
    prisma as never,
    redis as never,
    config as never,
    metrics as never
  );

  // Avoid real S3 network in unit tests.
  (ctl as unknown as { probeS3: () => Promise<string> }).probeS3 = async () =>
    opts.s3Up === false ? "down" : "up";

  return ctl;
}

describe("HealthController public surface (L1)", () => {
  it("GET /health returns minimal ok body", () => {
    const ctl = makeController({});
    assert.deepEqual(ctl.check(), { status: "ok" });
  });

  it("GET /health/live returns minimal ok body", () => {
    const ctl = makeController({});
    assert.deepEqual(ctl.live(), { status: "ok" });
  });

  it("GET /health/ready returns minimal ok when dependencies up", async () => {
    const ctl = makeController({ dbUp: true, redisUp: true, s3Up: true });
    assert.deepEqual(await ctl.ready(), { status: "ok" });
  });

  it("GET /health/ready returns 503 without dependency details when down", async () => {
    const ctl = makeController({ dbUp: false });
    await assert.rejects(
      () => ctl.ready(),
      (err: unknown) => {
        assert.ok(err instanceof HttpException);
        assert.equal(err.getStatus(), 503);
        assert.deepEqual(err.getResponse(), { status: "unavailable" });
        const body = JSON.stringify(err.getResponse());
        assert.ok(!body.includes("database"));
        assert.ok(!body.includes("redis"));
        assert.ok(!body.includes("corsOrigins"));
        assert.ok(!body.includes("metrics"));
        return true;
      }
    );
  });

  it("GET /health/details still exposes diagnostics for staff", async () => {
    const ctl = makeController({ dbUp: true, redisUp: true, s3Up: true });
    const body = await ctl.details();
    assert.equal(body.status, "ok");
    assert.equal(body.database, "up");
    assert.ok(Array.isArray(body.corsOrigins));
    assert.ok(body.metrics);
  });

  it("public health bodies do not include disclosure fields", () => {
    const ctl = makeController({});
    for (const body of [ctl.check(), ctl.live()]) {
      const keys = Object.keys(body).sort();
      assert.deepEqual(keys, ["status"]);
      assert.ok(!("corsOrigins" in body));
      assert.ok(!("metrics" in body));
      assert.ok(!("phase" in body));
      assert.ok(!("database" in body));
      assert.ok(!("redis" in body));
      assert.ok(!("service" in body));
    }
  });
});
