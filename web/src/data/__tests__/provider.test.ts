import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getBackendProvider,
  getApiBaseUrl,
  getSocketUrl,
  isApiProvider,
  isRelativeApiBase,
  usesSameOriginApiProxy,
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
        assert.equal(usesSameOriginApiProxy(), false);
      }
    );
  });

  it("relative /backend proxy is same-origin for REST and sockets", () => {
    withEnv(
      {
        NEXT_PUBLIC_API_URL: "/backend",
        NEXT_PUBLIC_SOCKET_URL: undefined,
        NEXT_PUBLIC_APP_URL: "https://helcalafkaaga.com",
      },
      () => {
        assert.equal(isRelativeApiBase("/backend"), true);
        assert.equal(getApiBaseUrl(), "/backend");
        assert.equal(usesSameOriginApiProxy(), true);
        assert.equal(getSocketUrl(), "https://helcalafkaaga.com");
      }
    );
  });

  it("production api.helcalafkaaga.com host is used for REST and Socket.IO", () => {
    withEnv(
      {
        NEXT_PUBLIC_API_URL: "https://api.helcalafkaaga.com/",
        NEXT_PUBLIC_SOCKET_URL: "https://api.helcalafkaaga.com/",
      },
      () => {
        assert.equal(getApiBaseUrl(), "https://api.helcalafkaaga.com");
        assert.equal(getSocketUrl(), "https://api.helcalafkaaga.com");
        assert.equal(usesSameOriginApiProxy(), false);
      }
    );
  });

  it("browser on helcalafkaaga.com ignores cross-site onrender NEXT_PUBLIC_API_URL", () => {
    const prev = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: {
        location: {
          origin: "https://helcalafkaaga.com",
          hostname: "helcalafkaaga.com",
          protocol: "https:",
        },
      },
    });
    try {
      withEnv(
        {
          NEXT_PUBLIC_API_URL: "https://tel-calafkaaga-1.onrender.com",
          NEXT_PUBLIC_SOCKET_URL: "https://tel-calafkaaga-1.onrender.com",
        },
        () => {
          assert.equal(getApiBaseUrl(), "/backend");
          assert.equal(getSocketUrl(), "https://helcalafkaaga.com");
          assert.equal(usesSameOriginApiProxy(), true);
        }
      );
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        writable: true,
        value: prev,
      });
    }
  });
});
