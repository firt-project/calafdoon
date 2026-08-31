import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  REDACTED,
  sanitizeConnectionString,
  sanitizeForLog,
  sanitizeHeaders,
  sanitizeLogMessage,
  sanitizeUrl,
  serializeErrorForLog,
  serializeRequestForLog,
  serializeResponseForLog,
} from "./log-redact";

const MARK = {
  session: "FAKE_X_SESSION_TOKEN_MARKER_9f3a2b",
  auth: "Bearer FAKE_AUTHORIZATION_MARKER_7c1d",
  cookie: "hel_session=FAKE_COOKIE_MARKER_aabbcc; other=1",
  setCookie: "hel_session=FAKE_SET_COOKIE_MARKER_ddeeff; HttpOnly",
  csrf: "FAKE_CSRF_HEADER_MARKER_112233",
  stripe: "t=1,v1=FAKE_STRIPE_SIGNATURE_MARKER_445566",
  password: "FAKE_PASSWORD_MARKER_778899",
  sessionToken: "FAKE_SESSION_TOKEN_FIELD_MARKER_99aa",
  inviteUrl:
    "https://www.helcalafkaaga.com/admin/invite?token=FAKE_INVITE_TOKEN_MARKER_bbccdd",
  resetUrl:
    "https://www.helcalafkaaga.com/reset-password?token=FAKE_RESET_TOKEN_MARKER_eeff00",
  signedUrl:
    "https://bucket.r2.cloudflarestorage.com/obj?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=FAKECRED&X-Amz-Signature=FAKESIG123",
  databaseUrl: "postgresql://hel:FAKE_DB_PASSWORD_MARKER@localhost:5432/hel",
  redisUrl: "redis://:FAKE_REDIS_PASSWORD_MARKER@127.0.0.1:6379/0",
};

function assertNoMarkers(payload: unknown) {
  const json = JSON.stringify(payload);
  for (const [name, marker] of Object.entries(MARK)) {
    assert.equal(
      json.includes(marker),
      false,
      `marker leaked (${name}): ${marker}`
    );
  }
}

describe("log-redact (M10)", () => {
  it("redacts X-Session-Token case-insensitively without mutating input", () => {
    const headers = {
      "X-Session-Token": MARK.session,
      "Content-Type": "application/json",
    };
    const copy = { ...headers };
    const sanitized = sanitizeHeaders(headers);
    assert.equal(sanitized["X-Session-Token"], REDACTED);
    assert.equal(sanitized["Content-Type"], "application/json");
    assert.deepEqual(headers, copy);
    assert.equal(headers["X-Session-Token"], MARK.session);
  });

  it("redacts Authorization, Cookie, Set-Cookie, CSRF, Stripe signature", () => {
    const sanitized = sanitizeHeaders({
      authorization: MARK.auth,
      cookie: MARK.cookie,
      "set-cookie": MARK.setCookie,
      "x-csrf-token": MARK.csrf,
      "X-XSRF-TOKEN": MARK.csrf,
      "stripe-signature": MARK.stripe,
      "x-request-id": "req-keep",
    });
    assert.equal(sanitized.authorization, REDACTED);
    assert.equal(sanitized.cookie, REDACTED);
    assert.equal(sanitized["set-cookie"], REDACTED);
    assert.equal(sanitized["x-csrf-token"], REDACTED);
    assert.equal(sanitized["X-XSRF-TOKEN"], REDACTED);
    assert.equal(sanitized["stripe-signature"], REDACTED);
    assert.equal(sanitized["x-request-id"], "req-keep");
    assertNoMarkers(sanitized);
  });

  it("redacts nested sensitive fields and array entries", () => {
    const sanitized = sanitizeForLog({
      ok: true,
      nested: {
        password: MARK.password,
        sessionToken: MARK.sessionToken,
        profile: { name: "Amina" },
      },
      items: [{ token: MARK.sessionToken }, { role: "admin" }],
    });
    assertNoMarkers(sanitized);
    const obj = sanitized as {
      ok: boolean;
      nested: { password: string; profile: { name: string } };
      items: Array<{ token?: string; role?: string }>;
    };
    assert.equal(obj.ok, true);
    assert.equal(obj.nested.password, REDACTED);
    assert.equal(obj.nested.profile.name, "Amina");
    assert.equal(obj.items[0]?.token, REDACTED);
    assert.equal(obj.items[1]?.role, "admin");
  });

  it("redacts invite and reset token URLs", () => {
    assert.equal(sanitizeUrl(MARK.inviteUrl).includes("FAKE_INVITE"), false);
    assert.equal(sanitizeUrl(MARK.resetUrl).includes("FAKE_RESET"), false);
    assert.match(sanitizeUrl(MARK.inviteUrl), /token=%5BRedacted%5D|token=\[Redacted\]/);
    assertNoMarkers({
      invite: sanitizeUrl(MARK.inviteUrl),
      reset: sanitizeUrl(MARK.resetUrl),
    });
  });

  it("does not log signed R2/S3 URLs in full", () => {
    const out = sanitizeUrl(MARK.signedUrl);
    assert.equal(out.includes("FAKESIG"), false);
    assert.equal(out.includes("FAKECRED"), false);
    assert.match(out, /signed-url-redacted/);
  });

  it("sanitizes database and Redis connection strings", () => {
    assert.equal(
      sanitizeConnectionString(MARK.databaseUrl).includes("FAKE_DB_PASSWORD"),
      false
    );
    assert.equal(
      sanitizeConnectionString(MARK.redisUrl).includes("FAKE_REDIS_PASSWORD"),
      false
    );
    assert.match(sanitizeConnectionString(MARK.databaseUrl), /\*\*\*/);
    assert.match(sanitizeConnectionString(MARK.redisUrl), /\*\*\*/);
  });

  it("sanitizes Axios-style errors while keeping status and method", () => {
    const err = {
      name: "AxiosError",
      message: `Request failed ${MARK.inviteUrl}`,
      code: "ERR_BAD_REQUEST",
      status: 401,
      config: {
        method: "post",
        url: "https://api.example.com/v1/charge?token=FAKE_RESET_TOKEN_MARKER_eeff00",
        headers: {
          Authorization: MARK.auth,
          "x-session-token": MARK.session,
        },
        data: { password: MARK.password },
      },
      response: {
        status: 401,
        headers: { "set-cookie": MARK.setCookie },
        data: { secret: "nope" },
      },
      requestId: "req_provider_123",
    };
    const out = serializeErrorForLog(err);
    assertNoMarkers(out);
    assert.equal(out.code, "ERR_BAD_REQUEST");
    assert.equal(out.statusCode, 401);
    assert.equal(out.requestId, "req_provider_123");
    assert.equal((out.config as { method?: string }).method, "post");
    assert.equal(out.config && "headers" in (out.config as object), false);
  });

  it("request serializer keeps method/route diagnostics and redacts headers", () => {
    const originalHeaders = {
      "x-session-token": MARK.session,
      authorization: MARK.auth,
      cookie: MARK.cookie,
      "x-csrf-token": MARK.csrf,
      "stripe-signature": MARK.stripe,
      "x-request-id": "rid-1",
    };
    const frozen = { ...originalHeaders };
    const out = serializeRequestForLog({
      id: "rid-1",
      method: "POST",
      url: "/staff-invites/FAKE_INVITE_TOKEN_MARKER_bbccdd/accept",
      query: { token: MARK.sessionToken },
      params: { token: MARK.sessionToken },
      headers: originalHeaders,
      remoteAddress: "127.0.0.1",
      remotePort: 1234,
    });
    assert.deepEqual(originalHeaders, frozen);
    assert.equal(out.method, "POST");
    assert.equal(out.id, "rid-1");
    assert.match(String(out.url), /\/staff-invites\/:token\/accept/);
    assert.equal(
      (out.headers as Record<string, string>)["x-session-token"],
      REDACTED
    );
    assert.equal(
      (out.headers as Record<string, string>)["x-request-id"],
      "rid-1"
    );
    assertNoMarkers(out);
  });

  it("response serializer redacts Set-Cookie but keeps status", () => {
    const out = serializeResponseForLog({
      statusCode: 201,
      headers: { "set-cookie": MARK.setCookie, "x-request-id": "rid-2" },
    });
    assert.equal(out.statusCode, 201);
    assert.equal(
      (out.headers as Record<string, string>)["set-cookie"],
      REDACTED
    );
    assertNoMarkers(out);
  });

  it("handles circular metadata without throwing", () => {
    const a: Record<string, unknown> = { ok: true };
    a.self = a;
    const out = sanitizeForLog(a);
    assert.equal((out as { self: string }).self, "[Circular]");
  });

  it("redaction never throws during error handling", () => {
    assert.doesNotThrow(() => sanitizeForLog(undefined));
    assert.doesNotThrow(() => sanitizeForLog({ get x() { throw new Error("boom"); } }));
    assert.doesNotThrow(() =>
      serializeErrorForLog({
        get message() {
          throw new Error("boom");
        },
      })
    );
    assert.doesNotThrow(() => sanitizeLogMessage(MARK.inviteUrl));
  });

  it("mail-oriented log messages redact token query values", () => {
    const msg = sanitizeLogMessage(`Accept: ${MARK.inviteUrl}`);
    assert.equal(msg.includes("FAKE_INVITE_TOKEN_MARKER"), false);
    assert.match(msg, /token=%5BRedacted%5D|token=\[Redacted\]/);
  });
});
