import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeAccessState,
  getAuthenticatedHomeRoute,
} from "../common/access-state";
import { hasPaidAccess, isPremiumMember, isStaffRole } from "../common/access";
import { assertGenderMutable, isGenderLocked } from "./gender-lock";
import {
  canViewerSeePhotos,
  MAX_PROFILE_PHOTOS,
} from "./photo-rules";
import {
  assertProfileFullyComplete,
  getProfileIncompleteReason,
} from "./profile-completeness";
import {
  PROFILE_FIELD_KEYS,
  pruneIncompleteAutosaveWrites,
  splitQuestionnaireData,
  STAFF_ONLY_PROFILE_FIELDS,
} from "./questionnaire";
import {
  isDiscoverable,
  needsApprovalGate,
  resolveReviewStatus,
  requiresAdminProfileApproval,
} from "../common/review-status";

describe("access-state routing", () => {
  it("routes staff to admin", () => {
    assert.equal(
      getAuthenticatedHomeRoute({ role: "admin", questionnaireComplete: false }),
      "/admin"
    );
    assert.equal(
      computeAccessState({
        authenticated: true,
        profile: { role: "owner", hasPaid: true, questionnaireComplete: true },
      }).nextRoute,
      "/admin"
    );
  });

  it("routes missing gender / registration to register details", () => {
    assert.equal(
      getAuthenticatedHomeRoute({
        role: "user",
        registrationComplete: false,
        questionnaireComplete: false,
      }),
      "/register/details"
    );
  });

  it("routes incomplete questionnaire to questionnaire", () => {
    assert.equal(
      getAuthenticatedHomeRoute({
        role: "user",
        registrationComplete: true,
        questionnaireComplete: false,
      }),
      "/questionnaire"
    );
  });

  it("routes unpaid to payment", () => {
    assert.equal(
      getAuthenticatedHomeRoute({
        role: "user",
        registrationComplete: true,
        questionnaireComplete: true,
        hasPaid: false,
      }),
      "/payment"
    );
  });

  it("routes paid approved user to dashboard home feed", () => {
    assert.equal(
      getAuthenticatedHomeRoute({
        role: "user",
        registrationComplete: true,
        questionnaireComplete: true,
        hasPaid: true,
      }),
      "/dashboard"
    );
  });

  it("trial does not grant paid access", () => {
    assert.equal(
      hasPaidAccess({
        hasPaid: false,
        role: "user",
        trialEndsAt: Date.now() + 86_400_000,
      }),
      false
    );
    assert.equal(hasPaidAccess({ hasPaid: true, role: "user" }), true);
    assert.equal(hasPaidAccess({ hasPaid: false, role: "admin" }), true);
    assert.equal(
      hasPaidAccess({
        hasPaid: true,
        role: "user",
        paidUntil: new Date(Date.now() + 86_400_000).toISOString(),
      }),
      true
    );
    assert.equal(
      hasPaidAccess({
        hasPaid: true,
        role: "user",
        paidUntil: new Date(Date.now() - 1000).toISOString(),
      }),
      false
    );
  });
});

describe("approval / premium rules", () => {
  it("basic woman pending review needs approval gate", () => {
    const profile = {
      role: "user",
      gender: "female",
      hasPaid: true,
      hasPersonalSupport: false,
      questionnaireComplete: true,
      approved: false,
      reviewStatus: "pending_review",
    };
    assert.equal(requiresAdminProfileApproval(profile), true);
    assert.equal(needsApprovalGate(profile), true);
    assert.equal(resolveReviewStatus(profile), "pending_review");
  });

  it("premium flag uses hasPersonalSupport", () => {
    assert.equal(isPremiumMember({ hasPersonalSupport: true }), true);
    assert.equal(isPremiumMember({ hasPersonalSupport: false, paidCents: 500 }), false);
    assert.equal(isPremiumMember({ paidCents: 2000 }), true);
  });

  it("banned resolves to suspended", () => {
    assert.equal(
      resolveReviewStatus({ banned: true, questionnaireComplete: true }),
      "suspended"
    );
  });

  it("admins and owners are never discoverable to members", () => {
    for (const role of ["admin", "owner"] as const) {
      assert.equal(
        isDiscoverable({
          role,
          banned: false,
          questionnaireComplete: true,
          hasPaid: true,
          approved: true,
          reviewStatus: "approved",
        }),
        false
      );
    }
    assert.equal(
      isDiscoverable({
        role: "user",
        banned: false,
        questionnaireComplete: true,
        hasPaid: true,
        approved: true,
        reviewStatus: "approved",
      }),
      true
    );
  });
});

describe("gender lock", () => {
  it("locks after payment", () => {
    assert.equal(isGenderLocked({ hasPaid: true }), true);
    assert.equal(isGenderLocked({ genderLocked: true }), true);
    assert.throws(() =>
      assertGenderMutable(
        { hasPaid: true, gender: "male" },
        "female"
      )
    );
    assert.doesNotThrow(() =>
      assertGenderMutable({ hasPaid: false, gender: "male" }, "female")
    );
  });
});

describe("questionnaire field mapping", () => {
  it("preserves profile field keys and staff-only denylist", () => {
    assert.ok(PROFILE_FIELD_KEYS.has("qualities"));
    assert.ok(PROFILE_FIELD_KEYS.has("prayerFrequency"));
    assert.ok(STAFF_ONLY_PROFILE_FIELDS.has("hasPaid"));
    assert.ok(STAFF_ONLY_PROFILE_FIELDS.has("role"));
  });

  it("splits questionnaire data and enriches prayer → religiousLevel", () => {
    const { profileUpdates, preferences } = splitQuestionnaireData({
      age: 28,
      prayerFrequency: "Always",
      wearsHijab: "Yes",
      preferences: { minAge: 25, partnerHijabLevel: "Always" },
      unknown: "drop-me",
    });
    assert.equal(profileUpdates.age, 28);
    assert.equal(profileUpdates.religiousLevel, "Very Practicing");
    assert.equal(profileUpdates.wearsHijab, true);
    assert.equal(preferences?.minAge, 25);
    assert.equal(profileUpdates.unknown, undefined);
  });

  it("prunes empty autosave writes", () => {
    const updates: Record<string, unknown> = {
      country: "Somalia",
      city: "",
      age: 0,
      qualities: [],
    };
    pruneIncompleteAutosaveWrites(updates);
    assert.equal(updates.country, "Somalia");
    assert.equal(updates.city, undefined);
    assert.equal(updates.age, undefined);
    assert.equal(updates.qualities, undefined);
  });
});

describe("questionnaire completion validation", () => {
  const completeFemale = {
    name: "Amina Hassan",
    phone: "+252617975403",
    age: 25,
    height: 165,
    weight: 60,
    country: "Somalia",
    city: "Mogadishu",
    languagesSpoken: ["Somali"],
    prayerFrequency: "Always",
    wearsHijab: true,
    gender: "female",
    education: "Bachelor",
    occupation: "Teacher",
    marriageWorkPreference: "Open to work",
    maritalStatus: "Never married",
    smokes: "No",
    marriageTimeline: "Within 1 year",
    qualities: ["Kind"],
    hobbies: ["Reading"],
    spousePrayerImportance: "Very important",
    profileImageMediaId: "11111111-1111-1111-1111-111111111111",
  };

  it("accepts a fully complete female profile", () => {
    assert.equal(
      getProfileIncompleteReason(completeFemale, {
        minAge: 25,
        minHeight: 160,
        minWeight: 55,
        educationLevel: "Bachelor",
      }),
      null
    );
  });

  it("allows completing without a profile photo", () => {
    const withoutPhoto = {
      ...completeFemale,
      profileImageMediaId: null,
      profileImageConvexId: null,
      profileImageId: null,
    };
    assert.equal(
      getProfileIncompleteReason(withoutPhoto, {
        minAge: 25,
        minHeight: 160,
        minWeight: 55,
        educationLevel: "Bachelor",
      }),
      null
    );
  });

  it("requires partnerHijabLevel for male preferences", () => {
    const male = {
      ...completeFemale,
      gender: "male",
      wearsHijab: undefined,
    };
    const prefsMissingHijab = {
      minAge: 20,
      minHeight: 150,
      minWeight: 60,
      educationLevel: "Bachelor",
    };
    assert.match(
      getProfileIncompleteReason(male, prefsMissingHijab) ?? "",
      /partner preferences/
    );
    assert.equal(
      getProfileIncompleteReason(male, {
        ...prefsMissingHijab,
        partnerHijabLevel: "Always",
      }),
      null
    );
  });
});

describe("photo visibility rules", () => {
  it("owner and staff always see; private denies others; matches gate", () => {
    assert.equal(
      canViewerSeePhotos({
        viewerUserId: "u1",
        profileOwnerUserId: "u1",
        photoVisibility: "private",
      }),
      true
    );
    assert.equal(
      canViewerSeePhotos({
        viewerUserId: "u2",
        profileOwnerUserId: "u1",
        photoVisibility: "private",
      }),
      false
    );
    assert.equal(
      canViewerSeePhotos({
        viewerUserId: "u2",
        profileOwnerUserId: "u1",
        photoVisibility: "matches",
        hasActiveMatch: false,
      }),
      false
    );
    assert.equal(
      canViewerSeePhotos({
        viewerUserId: "u2",
        profileOwnerUserId: "u1",
        photoVisibility: "matches",
        hasActiveMatch: true,
      }),
      true
    );
    assert.equal(MAX_PROFILE_PHOTOS, 5);
  });
});

describe("staff helpers", () => {
  it("recognizes staff roles", () => {
    assert.equal(isStaffRole("admin"), true);
    assert.equal(isStaffRole("owner"), true);
    assert.equal(isStaffRole("user"), false);
  });
});
