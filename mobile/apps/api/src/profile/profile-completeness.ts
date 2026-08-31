/** Port of convex/lib/profileCompleteness.ts */

import { isValidContactName, isValidContactPhone } from "./phone";

export type ProfileLike = {
  name?: string | null;
  phone?: string | null;
  age?: number | null;
  height?: number | null;
  weight?: number | null;
  country?: string | null;
  city?: string | null;
  languagesSpoken?: string[] | null;
  prayerFrequency?: string | null;
  wearsHijab?: boolean | null;
  gender?: string | null;
  education?: string | null;
  occupation?: string | null;
  financialReadiness?: string | null;
  marriageWorkPreference?: string | null;
  maritalStatus?: string | null;
  wantChildren?: string | null;
  polygynyOpenness?: string | null;
  hasCurrentWife?: string | null;
  openToSecondWife?: string | null;
  acceptPreviouslyMarriedMan?: string | null;
  acceptFutureCoWife?: string | null;
  smokes?: string | null;
  substanceDetails?: string | null;
  exercise?: string | null;
  marriageTimeline?: string | null;
  loveLanguage?: string | null;
  qualities?: string[] | null;
  hobbies?: string[] | null;
  spousePrayerImportance?: string | null;
  marrySomeoneWithChildren?: string | null;
  profileImageId?: string | null;
  profileImageConvexId?: string | null;
  profileImageMediaId?: string | null;
};

export type PrefsLike = {
  minAge?: number | null;
  maxAge?: number | null;
  minHeight?: number | null;
  maxHeight?: number | null;
  minWeight?: number | null;
  maxWeight?: number | null;
  preferredCountries?: string[] | null;
  educationLevel?: string | null;
  acceptChildren?: string | null;
  partnerHijabLevel?: string | null;
} | null;

function hasText(value: string | null | undefined): boolean {
  return !!value?.trim();
}

function isBasicComplete(profile: ProfileLike): boolean {
  return (
    (profile.age ?? 0) > 0 &&
    hasText(profile.country) &&
    hasText(profile.city) &&
    (profile.height ?? 0) > 0 &&
    (profile.weight ?? 0) > 0 &&
    (profile.languagesSpoken?.length ?? 0) > 0
  );
}

function isReligiousComplete(profile: ProfileLike): boolean {
  if (!hasText(profile.prayerFrequency)) return false;
  if (profile.gender === "female") {
    return profile.wearsHijab !== undefined && profile.wearsHijab !== null;
  }
  return true;
}

function isEducationComplete(profile: ProfileLike): boolean {
  const employmentOk =
    profile.gender === "female"
      ? hasText(profile.marriageWorkPreference)
      : true;
  return (
    hasText(profile.education) && hasText(profile.occupation) && employmentOk
  );
}

function isMarriageComplete(profile: ProfileLike): boolean {
  return hasText(profile.maritalStatus);
}

function isLifestyleComplete(profile: ProfileLike): boolean {
  return (
    profile.smokes === "No" ||
    (profile.smokes === "Yes" && hasText(profile.substanceDetails))
  );
}

function isAboutYouComplete(profile: ProfileLike): boolean {
  return (
    hasText(profile.marriageTimeline) &&
    (profile.qualities?.length ?? 0) > 0 &&
    (profile.hobbies?.length ?? 0) > 0
  );
}

function isContactComplete(profile: ProfileLike): boolean {
  return (
    isValidContactName(profile.name ?? "") &&
    isValidContactPhone(profile.phone ?? "")
  );
}

function isPreferencesComplete(profile: ProfileLike, prefs: PrefsLike): boolean {
  if (!prefs) return false;
  const appearanceOk =
    profile.gender === "male" ? !!prefs.partnerHijabLevel : true;
  return (
    appearanceOk &&
    prefs.minAge !== undefined &&
    prefs.minAge !== null &&
    prefs.minHeight !== undefined &&
    prefs.minHeight !== null &&
    prefs.minWeight !== undefined &&
    prefs.minWeight !== null &&
    !!prefs.educationLevel
  );
}

export function getProfileIncompleteReason(
  profile: ProfileLike,
  prefs?: PrefsLike
): string | null {
  if (!isBasicComplete(profile)) {
    return "Profile is incomplete: basic information is missing.";
  }
  if (!isReligiousComplete(profile)) {
    return "Profile is incomplete: religious practice answers are missing.";
  }
  if (!isEducationComplete(profile)) {
    return "Profile is incomplete: education and work answers are missing.";
  }
  if (!isMarriageComplete(profile)) {
    return "Profile is incomplete: marriage and family answers are missing.";
  }
  if (!isLifestyleComplete(profile)) {
    return "Profile is incomplete: lifestyle answers are missing.";
  }
  if (!isAboutYouComplete(profile)) {
    return "Profile is incomplete: about-you answers are missing.";
  }
  if (!isPreferencesComplete(profile, prefs ?? null)) {
    return "Profile is incomplete: partner preferences are missing.";
  }
  if (!isContactComplete(profile)) {
    return "Profile is incomplete: full name and valid phone number are required.";
  }
  // Profile photo is optional — members can complete without one.
  return null;
}

export function isProfileFullyComplete(
  profile: ProfileLike,
  prefs?: PrefsLike
): boolean {
  return getProfileIncompleteReason(profile, prefs) === null;
}

export function assertProfileFullyComplete(
  profile: ProfileLike,
  prefs?: PrefsLike
): void {
  const reason = getProfileIncompleteReason(profile, prefs);
  if (reason) throw new Error(reason);
}
