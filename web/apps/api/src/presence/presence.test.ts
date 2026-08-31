import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PRESENCE_TTL_SECONDS } from "./presence.service";

describe("presence constants", () => {
  it("uses a TTL long enough for heartbeat intervals", () => {
    assert.ok(PRESENCE_TTL_SECONDS >= 60);
  });
});
