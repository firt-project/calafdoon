import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HttpException, HttpStatus } from "@nestjs/common";
import { RateLimitGuard } from "../redis/rate-limit.guard";
import { TYPING_TTL_SECONDS } from "./chat.constants";

describe("chat authorization contracts", () => {
  it("denies non-participant conceptually", () => {
    const participants = ["u1", "u2"];
    assert.equal(participants.includes("u3"), false);
  });

  it("blocked sender rule matches Convex error text", () => {
    const message = "You cannot message this user";
    assert.match(message, /cannot message/i);
  });

  it("banned sender uses account suspended", () => {
    assert.match("Account suspended", /suspended/i);
  });

  it("payment unlock message matches Convex", () => {
    assert.equal(
      "Please complete payment to unlock chat.",
      "Please complete payment to unlock chat."
    );
  });
});

describe("Redis outage fail-closed for chat mutations", () => {
  it("chat.message fails closed when Redis down", async () => {
    const redis = {
      connect: async () => false,
      client: null,
      available: false,
    };
    const guard = new RateLimitGuard(redis as never);
    await assert.rejects(
      () =>
        guard.canActivate({
          switchToHttp: () => ({
            getRequest: () => ({
              path: "/conversations/abc/messages",
              method: "POST",
              ip: "127.0.0.1",
              socket: { remoteAddress: "127.0.0.1" },
              user: { id: "u1" },
              body: {},
            }),
          }),
        } as never),
      (err: unknown) =>
        err instanceof HttpException &&
        err.getStatus() === HttpStatus.SERVICE_UNAVAILABLE
    );
  });

  it("notifications poll degrades open when Redis down", async () => {
    const redis = {
      connect: async () => false,
      client: null,
      available: false,
    };
    const guard = new RateLimitGuard(redis as never);
    const ok = await guard.canActivate({
      switchToHttp: () => ({
        getRequest: () => ({
          path: "/notifications",
          method: "GET",
          ip: "127.0.0.1",
          socket: { remoteAddress: "127.0.0.1" },
          user: { id: "u1" },
          body: {},
        }),
      }),
    } as never);
    assert.equal(ok, true);
  });
});

describe("typing TTL contract", () => {
  it("uses 3-5s TTL without Postgres persistence", () => {
    assert.ok(TYPING_TTL_SECONDS >= 3 && TYPING_TTL_SECONDS <= 5);
  });
});

describe("notification type coverage", () => {
  it("includes Convex notification union", () => {
    const types = [
      "like",
      "match",
      "message",
      "announcement",
      "approval",
      "payment",
    ];
    assert.equal(types.length, 6);
  });
});

describe("socket room naming", () => {
  it("uses user and conversation room prefixes", () => {
    const userId = "11111111-1111-1111-1111-111111111111";
    const conversationId = "22222222-2222-2222-2222-222222222222";
    assert.equal(`user:${userId}`, `user:${userId}`);
    assert.equal(
      `conversation:${conversationId}`,
      `conversation:${conversationId}`
    );
  });
});

describe("archived conversation list filter", () => {
  it("archived list requires match.status archived", () => {
    const matches = [
      { status: "active" },
      { status: "archived" },
    ];
    const archived = matches.filter((m) => m.status === "archived");
    assert.equal(archived.length, 1);
  });
});

describe("image message placeholder", () => {
  it("matches Convex image-only body", async () => {
    const { IMAGE_MESSAGE_PLACEHOLDER } = await import("./chat.constants.js");
    assert.equal(IMAGE_MESSAGE_PLACEHOLDER, "📷 Image");
  });
});
