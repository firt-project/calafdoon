import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach, mock } from "node:test";

describe("api-client", () => {
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = "http://127.0.0.1:3001";
    // @ts-expect-error test stub
    globalThis.document = {
      cookie: "hel_csrf=test-csrf-token",
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    // @ts-expect-error restore
    globalThis.document = originalDocument;
  });

  it("sends CSRF header on mutating methods", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = mock.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    // Import after env is set
    const { apiClient } = await import("../api-client");
    await apiClient.post("/profile/me", { name: "x" });

    assert.equal(calls.length, 1);
    const headers = calls[0].init?.headers as Record<string, string>;
    assert.equal(headers["X-CSRF-Token"], "test-csrf-token");
    assert.equal(headers["Content-Type"], "application/json");
    assert.ok(headers["X-Request-Id"]);
  });

  it("does not retry POST payment without Idempotency-Key", async () => {
    let attempts = 0;
    globalThis.fetch = mock.fn(async () => {
      attempts += 1;
      return new Response(JSON.stringify({ message: "fail" }), { status: 500 });
    }) as typeof fetch;

    const { apiClient, ApiClientError } = await import("../api-client");

    await assert.rejects(
      () =>
        apiClient.post("/payments/stripe/registration-checkout", {
          tier: "basic",
        }),
      (err: unknown) => err instanceof ApiClientError && err.status === 500
    );
    assert.equal(attempts, 1);
  });

  it("retries GET on 5xx up to 2 retries", async () => {
    let attempts = 0;
    globalThis.fetch = mock.fn(async () => {
      attempts += 1;
      if (attempts < 3) {
        return new Response(JSON.stringify({ message: "fail" }), {
          status: 503,
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    const { apiClient } = await import("../api-client");
    const res = await apiClient.get<{ ok: boolean }>("/health");
    assert.equal(res.ok, true);
    assert.equal(attempts, 3);
  });
});
