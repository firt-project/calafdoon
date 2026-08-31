import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatWaafiTimestamp,
  normalizeWaafiAccountNo,
} from "./waafi-pay.client";
import { resolveWaafiPayerAccount } from "./waafi-payments.service";

describe("normalizeWaafiAccountNo", () => {
  it("keeps international Somalia numbers", () => {
    assert.equal(normalizeWaafiAccountNo("252611111111"), "252611111111");
    assert.equal(normalizeWaafiAccountNo("+252 61 111 1111"), "252611111111");
  });

  it("adds 252 for local mobiles", () => {
    assert.equal(normalizeWaafiAccountNo("611111111"), "252611111111");
    assert.equal(normalizeWaafiAccountNo("0611111111"), "252611111111");
  });

  it("strips 00 prefix", () => {
    assert.equal(normalizeWaafiAccountNo("00252611111111"), "252611111111");
  });

  it("rejects empty or too short", () => {
    assert.equal(normalizeWaafiAccountNo(""), null);
    assert.equal(normalizeWaafiAccountNo("123"), null);
  });
});

describe("resolveWaafiPayerAccount", () => {
  it("uses profile phone when submission omitted", () => {
    const r = resolveWaafiPayerAccount({
      profilePhone: "0611111111",
      submittedAccountNo: "",
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.accountNo, "252611111111");
  });

  it("allows matching international form of the same phone", () => {
    const r = resolveWaafiPayerAccount({
      profilePhone: "0611111111",
      submittedAccountNo: "252611111111",
    });
    assert.equal(r.ok, true);
  });

  it("rejects a different wallet", () => {
    const r = resolveWaafiPayerAccount({
      profilePhone: "252611111111",
      submittedAccountNo: "252622222222",
    });
    assert.deepEqual(r, { ok: false, reason: "mismatch" });
  });

  it("requires a profile phone", () => {
    const r = resolveWaafiPayerAccount({
      submittedAccountNo: "252611111111",
    });
    assert.deepEqual(r, { ok: false, reason: "no_profile_phone" });
  });
});

describe("formatWaafiTimestamp", () => {
  it("formats UTC like Waafi expects", () => {
    const d = new Date(Date.UTC(2024, 10, 5, 9, 4, 44));
    assert.equal(formatWaafiTimestamp(d), "2024-11-05 09:04:44");
  });
});
