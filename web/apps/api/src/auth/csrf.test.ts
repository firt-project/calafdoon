import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import {
  cookieSameSite,
  clearAuthCookies,
  CsrfGuard,
  CSRF_COOKIE,
  issueCsrfCookie,
  SESSION_COOKIE,
  setSessionCookie,
} from "./csrf";
import type { Response } from "express";

function mockContext(opts: {
  method?: string;
  path?: string;
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
}) {
  const req = {
    method: opts.method ?? "POST",
    path: opts.path ?? "/profile/me",
    url: opts.path ?? "/profile/me",
    cookies: opts.cookies ?? {},
    headers: opts.headers ?? {},
  };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  };
}

describe("cookieSameSite (same-site api.web.example.com)", () => {
  it("defaults to lax even when Secure (does not force None)", () => {
    const prev = process.env.COOKIE_SAMESITE;
    delete process.env.COOKIE_SAMESITE;
    assert.equal(cookieSameSite(true), "lax");
    assert.equal(cookieSameSite(false), "lax");
    process.env.COOKIE_SAMESITE = prev;
  });

  it("honors COOKIE_SAMESITE=none for intentional cross-site", () => {
    const prev = process.env.COOKIE_SAMESITE;
    process.env.COOKIE_SAMESITE = "none";
    assert.equal(cookieSameSite(true), "none");
    process.env.COOKIE_SAMESITE = prev;
  });

  it("honors COOKIE_SAMESITE override (strict / lax)", () => {
    const prev = process.env.COOKIE_SAMESITE;
    process.env.COOKIE_SAMESITE = "strict";
    assert.equal(cookieSameSite(true), "strict");
    process.env.COOKIE_SAMESITE = "lax";
    assert.equal(cookieSameSite(true), "lax");
    process.env.COOKIE_SAMESITE = prev;
  });
});

function mockCookieRes() {
  const calls: Array<{ name: string; value: string; opts: Record<string, unknown> }> =
    [];
  const res = {
    cookie(name: string, value: string, opts: Record<string, unknown>) {
      calls.push({ name, value, opts });
      return res;
    },
    clearCookie(name: string, opts: Record<string, unknown>) {
      calls.push({ name, value: "", opts: { ...opts, cleared: true } });
      return res;
    },
  };
  return { res: res as unknown as Response, calls };
}

describe("setSessionCookie / issueCsrfCookie", () => {
  it("sets host-only Secure+Lax session cookie when Domain unset", () => {
    const prev = process.env.COOKIE_SAMESITE;
    delete process.env.COOKIE_SAMESITE;
    const { res, calls } = mockCookieRes();
    const expiresAt = new Date("2030-01-01T00:00:00.000Z");
    setSessionCookie(res, "raw-session-token", {
      secure: true,
      expiresAt,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.name, SESSION_COOKIE);
    assert.equal(calls[0]!.opts.httpOnly, true);
    assert.equal(calls[0]!.opts.secure, true);
    assert.equal(calls[0]!.opts.sameSite, "lax");
    assert.equal(calls[0]!.opts.path, "/");
    assert.equal(calls[0]!.opts.domain, undefined);
    assert.equal(calls[0]!.opts.expires, expiresAt);
    process.env.COOKIE_SAMESITE = prev;
  });

  it("sets readable CSRF cookie with same Path/SameSite and no Domain by default", () => {
    const prev = process.env.COOKIE_SAMESITE;
    process.env.COOKIE_SAMESITE = "lax";
    const { res, calls } = mockCookieRes();
    const token = issueCsrfCookie(res, true);
    assert.ok(token.length > 0);
    assert.equal(calls[0]!.name, CSRF_COOKIE);
    assert.equal(calls[0]!.opts.httpOnly, false);
    assert.equal(calls[0]!.opts.secure, true);
    assert.equal(calls[0]!.opts.sameSite, "lax");
    assert.equal(calls[0]!.opts.path, "/");
    assert.equal(calls[0]!.opts.domain, undefined);
    process.env.COOKIE_SAMESITE = prev;
  });

  it("forces Secure when SameSite=None (cross-site override)", () => {
    const prev = process.env.COOKIE_SAMESITE;
    process.env.COOKIE_SAMESITE = "none";
    const { res, calls } = mockCookieRes();
    setSessionCookie(res, "tok", {
      secure: false, // caller may pass false; None still requires Secure
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });
    assert.equal(calls[0]!.opts.sameSite, "none");
    assert.equal(calls[0]!.opts.secure, true);
    process.env.COOKIE_SAMESITE = prev;
  });

  it("passes Domain through only when provided (prefer unset for host-only)", () => {
    const prev = process.env.COOKIE_SAMESITE;
    process.env.COOKIE_SAMESITE = "lax";
    const { res, calls } = mockCookieRes();
    setSessionCookie(res, "tok", {
      secure: true,
      domain: ".web.example.com",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });
    assert.equal(calls[0]!.opts.domain, ".web.example.com");
    clearAuthCookies(res, { secure: true, domain: ".web.example.com" });
    assert.equal(calls[1]!.opts.domain, ".web.example.com");
    process.env.COOKIE_SAMESITE = prev;
  });
});

describe("CsrfGuard (H5)", () => {
  const guard = new CsrfGuard();

  it("allows safe methods", () => {
    assert.equal(
      guard.canActivate(mockContext({ method: "GET" }) as never),
      true
    );
  });

  it("allows login without CSRF", () => {
    assert.equal(
      guard.canActivate(
        mockContext({ path: "/auth/login", method: "POST" }) as never
      ),
      true
    );
  });

  it("allows MFA verify-login without CSRF (L4 challenge completion)", () => {
    assert.equal(
      guard.canActivate(
        mockContext({
          path: "/auth/mfa/verify-login",
          method: "POST",
        }) as never
      ),
      true
    );
  });

  it("allows verify-email without CSRF (email-link flow)", () => {
    assert.equal(
      guard.canActivate(
        mockContext({ path: "/auth/verify-email", method: "POST" }) as never
      ),
      true
    );
  });

  it("allows Stripe webhook without CSRF", () => {
    assert.equal(
      guard.canActivate(
        mockContext({ path: "/webhooks/stripe", method: "POST" }) as never
      ),
      true
    );
  });

  it("allows cookie + matching CSRF header", () => {
    const token = "a".repeat(64);
    assert.equal(
      guard.canActivate(
        mockContext({
          cookies: { [SESSION_COOKIE]: "sess", [CSRF_COOKIE]: token },
          headers: { "x-csrf-token": token },
        }) as never
      ),
      true
    );
  });

  it("denies cookie without CSRF token", () => {
    assert.throws(
      () =>
        guard.canActivate(
          mockContext({
            cookies: { [SESSION_COOKIE]: "sess", [CSRF_COOKIE]: "abc" },
          }) as never
        ),
      ForbiddenException
    );
  });

  it("denies cookie with wrong CSRF token", () => {
    assert.throws(
      () =>
        guard.canActivate(
          mockContext({
            cookies: {
              [SESSION_COOKIE]: "sess",
              [CSRF_COOKIE]: "a".repeat(64),
            },
            headers: { "x-csrf-token": "b".repeat(64) },
          }) as never
        ),
      ForbiddenException
    );
  });

  it("does not skip CSRF when X-Session-Token is also present with cookie", () => {
    assert.throws(
      () =>
        guard.canActivate(
          mockContext({
            cookies: { [SESSION_COOKIE]: "sess", [CSRF_COOKIE]: "abc" },
            headers: { "x-session-token": "sess" },
          }) as never
        ),
      ForbiddenException
    );
  });

  it("allows header-only session without cookie (non-browser compat)", () => {
    assert.equal(
      guard.canActivate(
        mockContext({
          headers: { "x-session-token": "raw-token" },
        }) as never
      ),
      true
    );
  });

  it("malformed CSRF does not throw 500", () => {
    assert.throws(
      () =>
        guard.canActivate(
          mockContext({
            cookies: { [SESSION_COOKIE]: "sess", [CSRF_COOKIE]: "short" },
            headers: { "x-csrf-token": "also-short" },
          }) as never
        ),
      (err: unknown) => err instanceof ForbiddenException
    );
  });
});
