import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getBackendProvider,
  getApiBaseUrl,
  getSocketUrl,
  isApiProvider,
  validateBackendProvider,
} from "../provider";

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe("provider", () => {
  it("always returns api", () => {
    withEnv({ NEXT_PUBLIC_API_URL: undefined }, () => {
      assert.equal(getBackendProvider(), "api");
      assert.equal(validateBackendProvider(), "api");
      assert.equal(isApiProvider(), true);
    });
  });

  it("requires API URL", () => {
    withEnv(
      {
        NEXT_PUBLIC_API_URL: undefined,
        NEXT_PUBLIC_SOCKET_URL: undefined,
      },
      () => {
        assert.throws(() => getApiBaseUrl(), /NEXT_PUBLIC_API_URL/);
        assert.throws(
          () => getSocketUrl(),
          /NEXT_PUBLIC_SOCKET_URL|NEXT_PUBLIC_API_URL/
        );
      }
    );
  });

  it("api with URLs succeeds", () => {
    withEnv(
      {
        NEXT_PUBLIC_API_URL: "http://127.0.0.1:3001/",
        NEXT_PUBLIC_SOCKET_URL: "http://127.0.0.1:3001/",
      },
      () => {
        assert.equal(getApiBaseUrl(), "http://127.0.0.1:3001");
        assert.equal(getSocketUrl(), "http://127.0.0.1:3001");
      }
    );
  });
});
