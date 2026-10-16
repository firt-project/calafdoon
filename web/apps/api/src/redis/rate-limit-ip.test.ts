import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { rateLimitClientIp } from "./rate-limit.guard";

const req = (headers: Record<string, string>, ip = "10.0.0.9") =>
  ({ headers, ip, socket: { remoteAddress: "10.0.0.1" } }) as never;

describe("rateLimitClientIp", () => {
  afterEach(() => {
    delete process.env.RATE_LIMIT_USE_CF_IP;
  });
  it("uses req.ip by default and ignores CF-Connecting-IP", () => {
    assert.equal(rateLimitClientIp(req({ "cf-connecting-ip": "1.2.3.4" })), "10.0.0.9");
  });
  it("uses CF-Connecting-IP when enabled", () => {
    process.env.RATE_LIMIT_USE_CF_IP = "true";
    assert.equal(rateLimitClientIp(req({ "cf-connecting-ip": "203.0.113.7" })), "203.0.113.7");
    assert.equal(rateLimitClientIp(req({ "cf-connecting-ip": "2001:db8::1" })), "2001:db8::1");
  });
  it("ignores a malformed header and falls back", () => {
    process.env.RATE_LIMIT_USE_CF_IP = "true";
    assert.equal(rateLimitClientIp(req({ "cf-connecting-ip": "1.2.3.4, 5.6.7.8; drop" })), "10.0.0.9");
    assert.equal(rateLimitClientIp(req({})), "10.0.0.9");
  });
});
