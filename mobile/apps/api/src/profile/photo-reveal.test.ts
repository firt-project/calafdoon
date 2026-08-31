import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_PRIVATE_PHOTOS,
  PRIVATE_REVEALS_PER_MATCH_BASIC,
  PRIVATE_REVEALS_PER_MATCH_PREMIUM,
} from "./photo-rules";

describe("private photo reveal limits", () => {
  it("caps private gallery and reveal credits", () => {
    assert.equal(MAX_PRIVATE_PHOTOS, 2);
    assert.equal(PRIVATE_REVEALS_PER_MATCH_BASIC, 1);
    assert.equal(PRIVATE_REVEALS_PER_MATCH_PREMIUM, 2);
    assert.ok(PRIVATE_REVEALS_PER_MATCH_PREMIUM > PRIVATE_REVEALS_PER_MATCH_BASIC);
  });
});
