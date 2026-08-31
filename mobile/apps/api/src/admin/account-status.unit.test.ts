import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { capturableStatus } from "./account-status.service";
import {
  percentChange,
  previousPeriod,
  resolveDateRange,
} from "./date-range";

describe("capturableStatus", () => {
  it("captures approved", () => {
    assert.equal(
      capturableStatus({
        banned: false,
        reviewStatus: "approved",
        questionnaireComplete: true,
        approved: true,
      }),
      "approved"
    );
  });

  it("captures pending_review", () => {
    assert.equal(
      capturableStatus({
        banned: false,
        reviewStatus: "pending_review",
        questionnaireComplete: true,
        approved: false,
      }),
      "pending_review"
    );
  });

  it("captures rejected", () => {
    assert.equal(
      capturableStatus({
        banned: false,
        reviewStatus: "rejected",
        questionnaireComplete: true,
        approved: false,
      }),
      "rejected"
    );
  });
});

describe("date-range", () => {
  it("resolves today in UTC as [start, nextDay)", () => {
    const now = new Date("2026-08-01T15:30:00.000Z");
    const range = resolveDateRange({
      preset: "today",
      timeZone: "UTC",
      now,
    });
    assert.equal(range.from.toISOString(), "2026-08-01T00:00:00.000Z");
    assert.equal(range.to.toISOString(), "2026-08-02T00:00:00.000Z");
  });

  it("custom range requires end after start", () => {
    assert.throws(() =>
      resolveDateRange({
        preset: "custom",
        from: "2026-08-02T00:00:00.000Z",
        to: "2026-08-01T00:00:00.000Z",
      })
    );
  });

  it("percentChange handles zero previous safely", () => {
    assert.equal(percentChange(0, 0), 0);
    assert.equal(percentChange(5, 0), null);
    assert.equal(percentChange(110, 100), 10);
  });

  it("previousPeriod mirrors duration", () => {
    const from = new Date("2026-08-01T00:00:00.000Z");
    const to = new Date("2026-08-08T00:00:00.000Z");
    const prev = previousPeriod(from, to);
    assert.equal(prev.from.toISOString(), "2026-07-25T00:00:00.000Z");
    assert.equal(prev.to.toISOString(), "2026-08-01T00:00:00.000Z");
  });
});
