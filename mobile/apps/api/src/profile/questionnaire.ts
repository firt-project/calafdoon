/** Port of convex/lib/questionnaire.ts — exact field keys and autosave pruning. */

import { BadRequestException } from "@nestjs/common";
import { enrichProfileUpdates } from "./profile-enrichment";
import {
  isValidContactName,
  isValidContactPhone,
  normalizeContactPhone,
} from "./phone";

/** Profile fields that may be written by the questionnaire. */
export const PROFILE_FIELD_KEYS = new Set([
  "age",
  "height",
  "weight",
  "country",
  "city",
  "education",
  "occupation",
  "religiousLevel",
  "maritalStatus",
  "children",
  "prayerFrequency",
  "spousePrayerImportance",
  "wearsHijab",
  "hasBeard",
  "gender",
  "name",
  "phone",
  "smokes",
  "substanceDetails",
  "exercise",
  "wantChildren",
  "livingSituation",
  "polygynyOpenness",
  "hasCurrentWife",
  "openToSecondWife",
  "acceptManWithWife",
  "acceptPreviouslyMarriedMan",
  "acceptFutureCoWife",
  "languagesSpoken",
  "citizenshipStatus",
  "financialReadiness",
  "marriageWorkPreference",
  "marriageTimeline",
  "loveLanguage",
  "marrySomeoneWithChildren",
  "qualities",
  "hobbies",
]);

export const PREFERENCE_FIELD_KEYS = new Set([
  "preferredGender",
  "minAge",
  "maxAge",
  "minHeight",
  "maxHeight",
  "minWeight",
  "maxWeight",
  "preferredCountries",
  "acceptChildren",
  "educationLevel",
  "religiousLevel",
  "acceptDivorcee",
  "acceptWidow",
  "maxDistance",
  "qualities",
  "hobbies",
  "partnerBeard",
  "partnerHijabLevel",
  "readyToRelocate",
]);

export function splitQuestionnaireData(data: Record<string, unknown>) {
  const preferences =
    data.preferences &&
    typeof data.preferences === "object" &&
    !Array.isArray(data.preferences)
      ? ({ ...(data.preferences as Record<string, unknown>) } as Record<
          string,
          unknown
        >)
      : undefined;

  const profileUpdates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === "preferences") continue;
    if (PROFILE_FIELD_KEYS.has(key)) {
      profileUpdates[key] = value;
    }
  }

  return {
    profileUpdates: enrichProfileUpdates(profileUpdates),
    preferences,
  };
}

export function stripClientLocationWrites(
  profileUpdates: Record<string, unknown>
): void {
  delete profileUpdates.locationLat;
  delete profileUpdates.locationLng;
  delete profileUpdates.locationAccuracyM;
  delete profileUpdates.locationVerifiedAt;
}

export function pruneIncompleteAutosaveWrites(
  profileUpdates: Record<string, unknown>,
  preferences?: Record<string, unknown>
): void {
  stripClientLocationWrites(profileUpdates);

  for (const key of Object.keys(profileUpdates)) {
    const value = profileUpdates[key];
    if (value === undefined || value === null) {
      delete profileUpdates[key];
      continue;
    }
    if (typeof value === "string" && value.trim() === "") {
      delete profileUpdates[key];
      continue;
    }
    if (Array.isArray(value) && value.length === 0) {
      delete profileUpdates[key];
      continue;
    }
    if (
      (key === "age" ||
        key === "height" ||
        key === "weight" ||
        key === "children") &&
      value === 0
    ) {
      delete profileUpdates[key];
    }
  }

  if (!preferences) return;

  for (const key of Object.keys(preferences)) {
    const value = preferences[key];
    if (value === undefined || value === null) {
      delete preferences[key];
      continue;
    }
    if (typeof value === "string" && value.trim() === "") {
      delete preferences[key];
      continue;
    }
    if (Array.isArray(value) && value.length === 0) {
      delete preferences[key];
      continue;
    }
    if (
      (key === "minAge" ||
        key === "maxAge" ||
        key === "minHeight" ||
        key === "maxHeight" ||
        key === "minWeight" ||
        key === "maxWeight") &&
      value === 0
    ) {
      delete preferences[key];
    }
  }
}

export const PROFILE_DEFAULTS = {
  spousePrayerImportance: "",
  questionnaireStep: 0,
} as const;

export const CONTACT_IN_PROGRESS_STEP = 9;
export const CONTACT_COMPLETE_STEP = 10;

export function hasValidContact(
  profile: { name?: string | null; phone?: string | null },
  updates: Record<string, unknown> = {}
): boolean {
  const name =
    typeof updates.name === "string" ? updates.name : profile.name ?? "";
  const phone =
    typeof updates.phone === "string" ? updates.phone : profile.phone ?? "";
  return isValidContactName(name) && isValidContactPhone(phone);
}

export function sanitizeContactProfileUpdates(
  updates: Record<string, unknown>,
  opts?: { strict?: boolean }
): void {
  const strict = opts?.strict === true;

  if (typeof updates.name === "string") {
    const name = updates.name.trim();
    if (!isValidContactName(name)) {
      if (strict) {
        throw new BadRequestException(
          "Enter your full name (at least 2 characters)."
        );
      }
      delete updates.name;
    } else {
      updates.name = name;
    }
  }
  if (typeof updates.phone === "string") {
    const normalized = normalizeContactPhone(updates.phone);
    if (!normalized) {
      if (strict) {
        throw new BadRequestException(
          "Enter a valid phone number with country code, e.g. +252 61 234 5678."
        );
      }
      delete updates.phone;
    } else {
      updates.phone = normalized;
    }
  }
}

/** Adults-only product: reject under-18 ages on write. Self-reported until DOB exists. */
export function assertEligibleAge(updates: Record<string, unknown>): void {
  if (!("age" in updates) || updates.age === undefined || updates.age === null) {
    return;
  }
  const age = Number(updates.age);
  if (!Number.isInteger(age) || age < 18 || age > 100) {
    throw new BadRequestException("Age must be an integer between 18 and 100");
  }
  updates.age = age;
}

/** Staff-controlled fields members must never write. */
export const STAFF_ONLY_PROFILE_FIELDS = new Set([
  "role",
  "hasPaid",
  "banned",
  "approved",
  "reviewStatus",
  "verified",
  "genderLocked",
  "hasPersonalSupport",
  "advisorReviewed",
  "trialEndsAt",
  "convexId",
  "userId",
  "convexUserId",
  "id",
]);
