import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { assertEligibleAge } from "./questionnaire";
import { isProfileFullyComplete } from "./profile-completeness";

describe("age eligibility", () => {
  it("rejects under-18 age writes", () => {
    assert.throws(
      () => assertEligibleAge({ age: 17 }),
      (err: unknown) => err instanceof BadRequestException
    );
  });

  it("accepts ages 18-100", () => {
    const updates = { age: 25 };
    assertEligibleAge(updates);
    assert.equal(updates.age, 25);
  });

  it("treats age under 18 as incomplete even with other fields filled", () => {
    const ok = isProfileFullyComplete(
      {
        age: 17,
        country: "Somalia",
        city: "Mogadishu",
        height: 170,
        weight: 70,
        languagesSpoken: ["Somali"],
        prayerFrequency: "Always",
        gender: "male",
        education: "Bachelor",
        occupation: "Full Time",
        financialReadiness: "Ready to support a family",
        maritalStatus: "Never married",
        wantChildren: "Yes",
        polygynyOpenness: "No",
        smokes: "Never",
        exercise: "Weekly",
        marriageTimeline: "Within 1 year",
        loveLanguage: "Quality Time",
        qualities: ["Honest"],
        hobbies: ["Reading"],
        spousePrayerImportance: "Very important",
        marrySomeoneWithChildren: "No",
        name: "Test User",
        phone: "+252612345678",
      },
      {
        minAge: 18,
        maxAge: 40,
        minHeight: 150,
        maxHeight: 200,
        minWeight: 45,
        preferredCountries: ["Somalia"],
        educationLevel: "Bachelor",
        acceptChildren: "No",
      }
    );
    assert.equal(ok, false);
  });
});
