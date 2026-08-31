/**
 * Unit tests for admin date-field → Prisma filter mapping (no DB).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAdminUserDateFilter } from "./admin-user-date-filter";
import { resolveDateRange } from "./date-range";

describe("buildAdminUserDateFilter", () => {
  it("maps registration preset today to user.createdAt range", () => {
    const result = buildAdminUserDateFilter({
      dateField: "registration",
      preset: "today",
      timeZone: "UTC",
    });
    assert.ok(result.from);
    assert.ok(result.to);
    assert.ok(result.profileWhere.user);
    const userWhere = result.profileWhere.user as {
      createdAt?: { gte: Date; lt: Date };
    };
    assert.ok(userWhere.createdAt?.gte);
    assert.ok(userWhere.createdAt?.lt);
  });

  it("maps approval to account_status_history event filter", () => {
    const result = buildAdminUserDateFilter({
      dateField: "approval",
      preset: "yesterday",
      timeZone: "UTC",
    });
    const events = result.profileWhere.accountStatusEvents as {
      some?: { eventType: string; createdAt: { gte: Date; lt: Date } };
    };
    assert.equal(events.some?.eventType, "approved");
    assert.ok(events.some?.createdAt.gte);
  });

  it("maps explicit eventType for clickable stats", () => {
    const result = buildAdminUserDateFilter({
      dateField: "event",
      eventType: "rejected",
      preset: "last_7_days",
      timeZone: "UTC",
    });
    const events = result.profileWhere.accountStatusEvents as {
      some?: { eventType: string };
    };
    assert.equal(events.some?.eventType, "rejected");
  });

  it("maps ban / unban event date fields", () => {
    const ban = buildAdminUserDateFilter({
      dateField: "ban",
      preset: "today",
      timeZone: "UTC",
    });
    const unban = buildAdminUserDateFilter({
      dateField: "unban",
      preset: "today",
      timeZone: "UTC",
    });
    assert.equal(
      (ban.profileWhere.accountStatusEvents as { some: { eventType: string } })
        .some.eventType,
      "banned"
    );
    assert.equal(
      (
        unban.profileWhere.accountStatusEvents as {
          some: { eventType: string };
        }
      ).some.eventType,
      "unbanned"
    );
  });

  it("respects timezone day boundaries for yesterday", () => {
    const utc = resolveDateRange({
      preset: "yesterday",
      timeZone: "UTC",
    });
    const nairobi = resolveDateRange({
      preset: "yesterday",
      timeZone: "Africa/Nairobi",
    });
    assert.notEqual(utc.from.toISOString(), nairobi.from.toISOString());
    assert.ok(utc.to.getTime() > utc.from.getTime());
    assert.ok(nairobi.to.getTime() > nairobi.from.getTime());
  });

  it("returns empty profileWhere when no date range", () => {
    const result = buildAdminUserDateFilter({
      dateField: "registration",
    });
    assert.deepEqual(result.profileWhere, {});
  });
});
