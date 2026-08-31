import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_MESSAGE_LENGTH,
  TYPING_TTL_SECONDS,
  decodeMessageCursor,
  encodeMessageCursor,
  sanitizeMessageBody,
} from "./chat.constants";
import {
  asUnreadMap,
  bumpUnread,
  readUnreadCount,
  zeroUnread,
} from "./unread";

describe("unread map helpers", () => {
  it("reads Postgres uuid key preferentially", () => {
    const map = {
      "pg-user-1": 2,
      "convex-user-1": 9,
    };
    assert.equal(readUnreadCount(map, "pg-user-1", "convex-user-1"), 2);
  });

  it("falls back to Convex id for migrated unread", () => {
    const map = { "convex-user-1": 3 };
    assert.equal(readUnreadCount(map, "pg-user-1", "convex-user-1"), 3);
  });

  it("bumps unread and normalizes to Postgres key", () => {
    const next = bumpUnread(
      { "convex-other": 1 },
      "pg-other",
      "convex-other",
      1
    );
    assert.equal(next["pg-other"], 2);
    assert.equal(next["convex-other"], undefined);
  });

  it("zeroes unread idempotently", () => {
    const once = zeroUnread({ "pg-me": 4, "convex-me": 4 }, "pg-me", "convex-me");
    assert.equal(once["pg-me"], 0);
    assert.equal(once["convex-me"], undefined);
    const twice = zeroUnread(once, "pg-me", "convex-me");
    assert.equal(twice["pg-me"], 0);
  });

  it("asUnreadMap ignores garbage", () => {
    assert.deepEqual(asUnreadMap(null), {});
    assert.deepEqual(asUnreadMap("x"), {});
  });
});

describe("message sanitize + cursor", () => {
  it("strips html/script", () => {
    assert.equal(
      sanitizeMessageBody('hi <script>alert(1)</script>'),
      "hi alert(1)"
    );
  });

  it("enforces max length constant matching Convex", () => {
    assert.equal(MAX_MESSAGE_LENGTH, 2000);
  });

  it("round-trips stable message cursor", () => {
    const at = new Date("2026-07-11T09:34:54.265Z");
    const id = "a36fc1e2-e122-445f-9742-929ff2ddd8e8";
    const encoded = encodeMessageCursor(at, id);
    const decoded = decodeMessageCursor(encoded);
    assert.ok(decoded);
    assert.equal(decoded!.id, id);
    assert.equal(decoded!.createdAt.toISOString(), at.toISOString());
  });

  it("typing TTL is 3–5 seconds", () => {
    assert.ok(TYPING_TTL_SECONDS >= 3 && TYPING_TTL_SECONDS <= 5);
  });
});

describe("conversation membership rules (pure)", () => {
  it("participant check uses match endpoints when array empty", () => {
    const participantUserIds: string[] = [];
    const match = { userAId: "a", userBId: "b" };
    const ids =
      participantUserIds.length >= 2
        ? participantUserIds
        : [match.userAId, match.userBId];
    assert.equal(ids.includes("a"), true);
    assert.equal(ids.includes("c"), false);
  });
});
