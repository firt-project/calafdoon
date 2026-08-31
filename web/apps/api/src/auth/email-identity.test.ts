import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emailIdentityScore,
  pickCanonicalEmailUser,
} from "./email-identity";

describe("email identity", () => {
  it("prefers paid complete profiles over empty newer ones", () => {
    const keep = pickCanonicalEmailUser([
      {
        id: "new-empty",
        createdAt: new Date("2026-07-20"),
        profile: {
          hasPaid: false,
          questionnaireComplete: false,
          registrationComplete: false,
        },
        authAccountCount: 1,
      },
      {
        id: "old-paid",
        createdAt: new Date("2026-01-01"),
        profile: {
          hasPaid: true,
          questionnaireComplete: true,
          registrationComplete: true,
        },
        authAccountCount: 1,
      },
    ]);
    assert.equal(keep?.id, "old-paid");
    assert.ok(
      emailIdentityScore({
        id: "old-paid",
        createdAt: new Date("2026-01-01"),
        profile: { hasPaid: true },
        authAccountCount: 1,
      }) >
        emailIdentityScore({
          id: "new-empty",
          createdAt: new Date("2026-07-20"),
          profile: { hasPaid: false },
          authAccountCount: 1,
        })
    );
  });

  it("when scores tie, keeps the older account", () => {
    const keep = pickCanonicalEmailUser([
      {
        id: "newer",
        createdAt: new Date("2026-06-01"),
        profile: { hasPaid: false, questionnaireComplete: true },
        authAccountCount: 1,
      },
      {
        id: "older",
        createdAt: new Date("2026-01-01"),
        profile: { hasPaid: false, questionnaireComplete: true },
        authAccountCount: 1,
      },
    ]);
    assert.equal(keep?.id, "older");
  });
});
