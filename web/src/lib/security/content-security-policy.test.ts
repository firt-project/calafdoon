import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildContentSecurityPolicy } from "./content-security-policy";

describe("buildContentSecurityPolicy (L2)", () => {
  it("production CSP is present and blocks plugins / framing / base hijack", () => {
    const csp = buildContentSecurityPolicy({
      NODE_ENV: "production",
      NEXT_PUBLIC_API_URL: "/backend",
      NEXT_PUBLIC_APP_URL: "https://web.example.com",
    });

    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /base-uri 'self'/);
    assert.match(csp, /upgrade-insecure-requests/);
    assert.doesNotMatch(csp, /unsafe-eval/);
    assert.match(csp, /script-src[^;]*'unsafe-inline'/);
    // Relative /backend → connect-src 'self' (first-party proxy)
    assert.match(csp, /connect-src[^;]*'self'/);
    assert.doesNotMatch(csp, /onrender\.com/);
    assert.match(csp, /googletagmanager\.com/);
    assert.match(csp, /frame-src[^;]*youtube-nocookie\.com/);
    assert.doesNotMatch(csp, /js\.stripe\.com/);
  });

  it("absolute api.web.example.com is allowed in connect-src when configured", () => {
    const csp = buildContentSecurityPolicy({
      NODE_ENV: "production",
      NEXT_PUBLIC_API_URL: "https://api.web.example.com",
      NEXT_PUBLIC_SOCKET_URL: "https://api.web.example.com",
      NEXT_PUBLIC_APP_URL: "https://web.example.com",
    });
    assert.match(
      csp,
      /connect-src[^;]*https:\/\/api\.web\.example\.com/
    );
    assert.match(
      csp,
      /connect-src[^;]*wss:\/\/api\.web\.example\.com/
    );
  });

  it("development CSP allows unsafe-eval and localhost sockets", () => {
    const csp = buildContentSecurityPolicy({
      NODE_ENV: "development",
      NEXT_PUBLIC_API_URL: "http://127.0.0.1:4000",
    });
    assert.match(csp, /unsafe-eval/);
    assert.match(csp, /ws:\/\/127\.0\.0\.1:4000/);
    assert.doesNotMatch(csp, /upgrade-insecure-requests/);
  });

  it("includes R2 upload hosts for signed media", () => {
    const csp = buildContentSecurityPolicy({
      NODE_ENV: "production",
      NEXT_PUBLIC_API_URL: "https://api.example.com",
    });
    assert.match(csp, /r2\.cloudflarestorage\.com/);
  });
});
