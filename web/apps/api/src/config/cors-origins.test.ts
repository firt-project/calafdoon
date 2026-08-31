import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveCorsOrigins } from "./cors-origins";

describe("resolveCorsOrigins (L5)", () => {
  it("merges CORS_ORIGINS and APP_URL in development", () => {
    const origins = resolveCorsOrigins({
      CORS_ORIGINS: "https://a.example, https://b.example/",
      APP_URL: "https://app.example",
      NODE_ENV: "development",
    } as NodeJS.ProcessEnv);
    assert.deepEqual(
      origins.sort(),
      ["https://a.example", "https://app.example", "https://b.example"].sort()
    );
  });

  it("uses localhost defaults when development has no CORS env", () => {
    const origins = resolveCorsOrigins({
      NODE_ENV: "development",
    } as NodeJS.ProcessEnv);
    assert.ok(origins.includes("http://localhost:3000"));
    assert.ok(origins.includes("capacitor://localhost"));
  });

  it("production trusts only explicitly configured origins", () => {
    const origins = resolveCorsOrigins({
      CORS_ORIGINS:
        "https://www.helcalafkaaga.com,https://helcalafkaaga.com",
      APP_URL: "https://www.helcalafkaaga.com",
      RENDER: "true",
      NODE_ENV: "production",
    } as NodeJS.ProcessEnv);
    assert.deepEqual(
      origins.sort(),
      ["https://helcalafkaaga.com", "https://www.helcalafkaaga.com"].sort()
    );
  });

  it("does not hardcode Vercel preview hosts in production", () => {
    const origins = resolveCorsOrigins({
      CORS_ORIGINS: "https://www.helcalafkaaga.com,https://helcalafkaaga.com",
      RENDER: "true",
      NODE_ENV: "production",
    } as NodeJS.ProcessEnv);
    assert.ok(!origins.some((o) => o.includes("vercel.app")));
    assert.ok(!origins.includes("https://tel-calafkaaga-1-api-one.vercel.app"));
  });

  it("allows preview only when explicitly listed in CORS_ORIGINS", () => {
    const preview = "https://tel-calafkaaga-1-api-one.vercel.app";
    const origins = resolveCorsOrigins({
      CORS_ORIGINS: `https://www.helcalafkaaga.com,${preview}`,
      NODE_ENV: "production",
      RENDER: "true",
    } as NodeJS.ProcessEnv);
    assert.ok(origins.includes(preview));
  });

  it("production with empty CORS env yields empty allowlist", () => {
    const origins = resolveCorsOrigins({
      NODE_ENV: "production",
      RENDER: "true",
    } as NodeJS.ProcessEnv);
    assert.deepEqual(origins, []);
  });

  it("rejects unauthorized origins by omission from allowlist", () => {
    const origins = resolveCorsOrigins({
      CORS_ORIGINS: "https://www.helcalafkaaga.com",
      NODE_ENV: "production",
    } as NodeJS.ProcessEnv);
    assert.ok(!origins.includes("https://evil.example"));
    assert.ok(!origins.includes("https://random-preview.vercel.app"));
  });
});
