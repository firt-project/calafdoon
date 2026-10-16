import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { hasActiveProfileVideo, resetActiveVideoCache } from "./active-video-cache";

describe("hasActiveProfileVideo", () => {
  beforeEach(() => resetActiveVideoCache());

  it("answers many cards with a single query", async () => {
    let queries = 0;
    const prisma = {
      profileVideo: {
        findMany: async () => {
          queries += 1;
          return [{ userId: "a" }, { userId: "b" }];
        },
      },
    };
    const results = await Promise.all(
      ["a", "b", "c", "a"].map((id) => hasActiveProfileVideo(prisma as never, id))
    );
    assert.deepEqual(results, [true, true, false, true]);
    assert.equal(queries, 1);
  });
});
