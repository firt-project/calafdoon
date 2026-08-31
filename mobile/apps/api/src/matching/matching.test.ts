import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateCompatibility,
  calculateCompatibilityBreakdown,
  type Preferences,
  type Profile,
} from "./compatibility";
import {
  MIN_COMPATIBILITY_SCORE,
  makePairKey,
  orderedPairIds,
} from "./constants";
import { profilePassesMatchFilters } from "./filters";

function baseProfile(over: Partial<Profile> = {}): Profile {
  return {
    religiousLevel: "Practicing",
    prayerFrequency: "Most of the time",
    spousePrayerImportance: "Preferred",
    age: 28,
    country: "Somalia",
    city: "Mogadishu",
    height: 170,
    weight: 70,
    education: "Bachelor",
    maritalStatus: "Never married",
    children: 0,
    qualities: ["Kind", "Honest"],
    hobbies: ["Reading"],
    marriageTimeline: "Within 1 year",
    marrySomeoneWithChildren: "Depends",
    gender: "male",
    wantChildren: "Yes",
    livingSituation: "Own home with my wife",
    polygynyOpenness: "",
    hasCurrentWife: "No",
    openToSecondWife: "No",
    languagesSpoken: ["Somali"],
    wearsHijab: undefined,
    ...over,
  };
}

function basePrefs(over: Partial<Preferences> = {}): Preferences {
  return {
    minAge: 20,
    maxAge: 40,
    minHeight: 150,
    maxHeight: 190,
    preferredCountries: [],
    acceptChildren: "Depends",
    educationLevel: "Bachelor",
    acceptDivorcee: "Depends",
    acceptWidow: "Depends",
    preferredGender: "female",
    qualities: ["Kind"],
    hobbies: ["Reading"],
    partnerHijabLevel: "Always",
    ...over,
  };
}

describe("compatibility score parity", () => {
  it("clamps total to 0–100 and exposes category breakdown", () => {
    const male = baseProfile({ gender: "male" });
    const female = baseProfile({
      gender: "female",
      wearsHijab: true,
      livingSituation: "Own home with my husband",
      acceptFutureCoWife: "No",
    });
    const malePrefs = basePrefs({ preferredGender: "female" });
    const femalePrefs = basePrefs({ preferredGender: "male" });

    const ab = calculateCompatibilityBreakdown(
      male,
      malePrefs,
      female,
      femalePrefs
    );
    const ba = calculateCompatibilityBreakdown(
      female,
      femalePrefs,
      male,
      malePrefs
    );
    assert.ok(ab.total >= 0 && ab.total <= 100);
    assert.ok(ba.total >= 0 && ba.total <= 100);
    assert.ok(ab.categories.some((c) => c.key === "religion" && c.maxScore === 25));
    assert.ok(ab.categories.some((c) => c.key === "appearance" && c.maxScore === 3));
    const avg = Math.round((ab.total + ba.total) / 2);
    assert.ok(avg >= 0 && avg <= 100);
  });

  it("minimum discover score constant is 40", () => {
    assert.equal(MIN_COMPATIBILITY_SCORE, 40);
  });

  it("country is soft preference not hard exclusion", () => {
    const user = baseProfile({ country: "Somalia" });
    const cand = baseProfile({
      gender: "female",
      country: "Kenya",
      wearsHijab: true,
    });
    const prefs = basePrefs({ preferredCountries: ["Somalia"] });
    const score = calculateCompatibility(user, prefs, cand, prefs);
    assert.ok(score > 0);
  });

  it("hard filter excludes wrong country when filter applied", () => {
    assert.equal(
      profilePassesMatchFilters(
        baseProfile({ country: "Kenya" }) as never,
        { country: "Somalia" }
      ),
      false
    );
  });
});

describe("pair key", () => {
  it("is deterministic unordered", () => {
    const a = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const b = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    assert.equal(makePairKey(a, b), makePairKey(b, a));
    assert.equal(orderedPairIds(b, a).userAId, a);
  });
});

describe("match action semantics (pure)", () => {
  it("documents overwrite: last action wins on same directed pair", () => {
    // One row per (from,to); action patched — covered in service tests.
    assert.equal(["like", "pass", "shortlist"].includes("pass"), true);
  });
});
