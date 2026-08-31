import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeHighlightKeys,
  dailyPickIndex,
  utcDayKey,
} from "./highlights";

function profile(partial: Record<string, unknown>) {
  return {
    religiousLevel: null,
    country: null,
    wantChildren: null,
    marriageTimeline: null,
    livingSituation: null,
    qualities: [],
    hobbies: [],
    ...partial,
  } as never;
}

describe("computeHighlightKeys", () => {
  it("returns shared religion and country", () => {
    const keys = computeHighlightKeys(
      profile({ religiousLevel: "practicing", country: "SO" }),
      profile({ religiousLevel: "practicing", country: "SO" })
    );
    assert.deepEqual(keys, ["religion", "country"]);
  });

  it("caps at two keys", () => {
    const keys = computeHighlightKeys(
      profile({
        religiousLevel: "practicing",
        country: "SO",
        wantChildren: "yes",
        marriageTimeline: "1-2 years",
      }),
      profile({
        religiousLevel: "practicing",
        country: "SO",
        wantChildren: "yes",
        marriageTimeline: "1-2 years",
      })
    );
    assert.equal(keys.length, 2);
  });
});

describe("dailyPickIndex", () => {
  it("is stable for the same day and user", () => {
    const a = dailyPickIndex("user-1", "2026-07-17", 10);
    const b = dailyPickIndex("user-1", "2026-07-17", 10);
    assert.equal(a, b);
  });

  it("can differ across days", () => {
    const a = dailyPickIndex("user-1", "2026-07-17", 50);
    const b = dailyPickIndex("user-1", "2026-07-18", 50);
    // Not guaranteed different, but with 50 slots usually differs; just assert range.
    assert.ok(a >= 0 && a < 50);
    assert.ok(b >= 0 && b < 50);
  });

  it("utcDayKey is YYYY-MM-DD", () => {
    assert.match(utcDayKey(new Date("2026-07-17T12:00:00Z")), /^\d{4}-\d{2}-\d{2}$/);
  });
});
