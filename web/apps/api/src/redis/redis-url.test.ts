import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveRedisUrl } from "./redis-url";

describe("resolveRedisUrl (M12)", () => {
  it("returns default when URL missing", () => {
    assert.equal(resolveRedisUrl({}), "redis://127.0.0.1:6379");
  });

  it("leaves authenticated production URLs unchanged", () => {
    const url = "rediss://default:prod-secret@oregon-redis.render.com:6379";
    assert.equal(
      resolveRedisUrl({ redisUrl: url, redisPassword: "ignored" }),
      url
    );
  });

  it("injects REDIS_PASSWORD when URL has no password", () => {
    const resolved = resolveRedisUrl({
      redisUrl: "redis://127.0.0.1:6379",
      redisPassword: "change-me",
    });
    assert.match(resolved, /^redis:\/\/:change-me@127\.0\.0\.1:6379\/?$/);
  });

  it("supports redis://:pass@host form without REDIS_PASSWORD", () => {
    const url = "redis://:change-me@127.0.0.1:6379/0";
    assert.equal(resolveRedisUrl({ redisUrl: url }), url);
  });
});
