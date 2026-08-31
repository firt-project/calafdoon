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

  it("sends CSRF header on mutating methods with credentials", async () => {
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
    assert.equal(headers["X-Session-Token"], undefined);
    assert.equal(calls[0].init?.credentials, "include");
  });

  it("does not persist session tokens in sessionStorage", async () => {
    const store = new Map<string, string>();
    // @ts-expect-error test stub
    globalThis.sessionStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };

    const { setApiSessionToken, getApiSessionToken } = await import(
      "../api-client"
    );
    store.set("hel_session_token", "stolen");
    setApiSessionToken("should-not-store");
    assert.equal(getApiSessionToken(), undefined);
    assert.equal(store.has("hel_session_token"), false);
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
