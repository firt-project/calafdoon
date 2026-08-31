import type { Profile } from "@/types";
import { ABOUT_YOU_STEP_COUNT, CONTACT_STEP_INDEX, PHOTO_STEP_INDEX, STEPS } from "@/components/questionnaire/steps";

import { isValidContactPhone } from "@/lib/phone";

export interface Preferences {
  minAge?: number;
  maxAge?: number;
  minHeight?: number;
  maxHeight?: number;
  minWeight?: number;
  maxWeight?: number;
  preferredCountries?: string[];
  educationLevel?: string;
  religiousLevel?: string;
  acceptDivorcee?: string;
  acceptWidow?: string;
  acceptChildren?: string;
  partnerBeard?: string;
  partnerHijabLevel?: string;
}

export interface ProfileSection {
  id: string;
  title: string;
  stepIndex: number;
}

export const PROFILE_SECTIONS: ProfileSection[] = [
  { id: "gender", title: "About you", stepIndex: 0 },
  { id: "basic", title: "Basic Information", stepIndex: 1 },
  { id: "religious", title: "Your Religious Practice", stepIndex: 2 },
  { id: "education", title: "Education & Work", stepIndex: 3 },
  { id: "marriage", title: "Marriage & Family", stepIndex: 5 },
  { id: "lifestyle", title: "Lifestyle", stepIndex: 6 },
  { id: "about", title: "About You", stepIndex: 7 },
  { id: "preferences", title: "Partner Preferences", stepIndex: 8 },
  { id: "contact", title: "Contact Details", stepIndex: 9 },
  { id: "photo", title: "Profile Photo", stepIndex: 10 },
];

export type SectionStatus = "complete" | "in_progress" | "not_started";

export function isMarriageComplete(profile: Profile): boolean {
  return !!profile.maritalStatus;
}

export function isEducationComplete(profile: Profile): boolean {
  const employmentPreferenceComplete =
    profile.gender === "female" ? !!profile.marriageWorkPreference : true;
  return !!profile.education && !!profile.occupation && employmentPreferenceComplete;
}

export function isGenderChosen(profile: Profile): boolean {
  // registrationComplete is set only after the user picks man/woman.
  return profile.registrationComplete === true;
}

export function isBasicComplete(profile: Profile): boolean {
  return (
    profile.age > 0 &&
    !!profile.country &&
    !!profile.city &&
    profile.height > 0 &&
    profile.weight > 0 &&
    (profile.languagesSpoken?.length ?? 0) > 0
  );
}

export function isReligiousComplete(profile: Profile): boolean {
  const base = !!profile.prayerFrequency;
  if (profile.gender === "female") {
    return base && profile.wearsHijab !== undefined;
  }
  return base;
}

export function isAboutYouComplete(profile: Profile): boolean {
  return (
    !!profile.marriageTimeline &&
    (profile.qualities?.length ?? 0) > 0 &&
    (profile.hobbies?.length ?? 0) > 0
  );
}

export function isLifestyleComplete(profile: Profile): boolean {
  return (
    profile.smokes === "No" ||
    (profile.smokes === "Yes" && !!profile.substanceDetails?.trim())
  );
}

export function isPhotoComplete(_profile: Profile): boolean {
  // Photo is optional — never blocks profile readiness.
  return true;
}

export function isContactComplete(profile: Profile): boolean {
  const name = profile.name?.trim() ?? "";
  const phone = profile.phone?.trim() ?? "";
  return name.length >= 2 && name !== "User" && isValidContactPhone(phone);
}

export function isPreferencesComplete(
  profile: Profile,
  prefs: Preferences | null | undefined
): boolean {
  if (!prefs) return false;
  const appearanceOk =
    profile.gender === "male" ? !!prefs.partnerHijabLevel : true;
  return (
    appearanceOk &&
    prefs.minAge !== undefined &&
    prefs.minHeight !== undefined &&
    prefs.minWeight !== undefined &&
    !!prefs.educationLevel
  );
}

export function isAboutYouPhaseComplete(
  profile: Profile,
  prefs?: Preferences | null
): boolean {
  return (
    isBasicComplete(profile) &&
    isReligiousComplete(profile) &&
    isEducationComplete(profile) &&
    isMarriageComplete(profile) &&
    isLifestyleComplete(profile) &&
    isAboutYouComplete(profile)
  );
}

const sectionCheckers: Record<
  string,
  (profile: Profile, prefs?: Preferences | null) => boolean
> = {
  gender: (p) => isGenderChosen(p),
  basic: (p) => isBasicComplete(p),
  religious: (p) => isReligiousComplete(p),
  education: (p) => isEducationComplete(p),
  marriage: (p) => isMarriageComplete(p),
  lifestyle: (p) => isLifestyleComplete(p),
  about: (p) => isAboutYouComplete(p),
  preferences: (p, prefs) => isPreferencesComplete(p, prefs),
  contact: (p) => isContactComplete(p),
  photo: (p) => isPhotoComplete(p),
};

export function getSectionStatus(
  sectionId: string,
  profile: Profile,
  prefs?: Preferences | null
): SectionStatus {
  const checker = sectionCheckers[sectionId];
  if (!checker) return "not_started";
  if (checker(profile, prefs)) return "complete";

  const section = PROFILE_SECTIONS.find((s) => s.id === sectionId);
  if (!section) return "not_started";

  const step = profile.questionnaireStep ?? 1;
  const sectionStep = section.stepIndex + 1;

  const partialChecks: Record<string, boolean> = {
    gender: false,
    basic:
      profile.age > 0 ||
      !!profile.country ||
      !!profile.city ||
      (profile.languagesSpoken?.length ?? 0) > 0,
    religious: !!profile.prayerFrequency,
    education:
      !!profile.education ||
      !!profile.occupation ||
      !!profile.marriageWorkPreference,
    marriage: !!profile.maritalStatus,
    lifestyle: profile.smokes === "Yes" || profile.smokes === "No",
    about: !!profile.marriageTimeline,
    preferences:
      !!prefs?.educationLevel ||
      !!prefs?.partnerHijabLevel ||
      prefs?.minAge !== undefined ||
      prefs?.minHeight !== undefined ||
      prefs?.minWeight !== undefined ||
      (prefs?.preferredCountries?.length ?? 0) > 0,
    contact: isContactComplete(profile),
    photo: !!profile.profileImageId,
  };

  if (partialChecks[sectionId] || step >= sectionStep) return "in_progress";

  return "not_started";
}

export function calculateProfileProgress(
  profile: Profile,
  prefs?: Preferences | null
): number {
  const completed = PROFILE_SECTIONS.filter(
    (s) => getSectionStatus(s.id, profile, prefs) === "complete"
  ).length;
  return Math.round((completed / PROFILE_SECTIONS.length) * 100);
}

export function getRemainingProgressPercent(
  profile: Profile,
  prefs?: Preferences | null
): number {
  return Math.max(0, 100 - calculateProfileProgress(profile, prefs));
}

export function getRemainingSections(
  profile: Profile,
  prefs?: Preferences | null
): number {
  return PROFILE_SECTIONS.filter(
    (s) => getSectionStatus(s.id, profile, prefs) !== "complete"
  ).length;
}

export function getResumeStepIndex(
  profile: Profile,
  prefs?: Preferences | null
): number {
  if (profile.questionnaireComplete) return 0;

  for (const section of PROFILE_SECTIONS) {
    if (getSectionStatus(section.id, profile, prefs) !== "complete") {
      if (section.id === "education" && isReligiousComplete(profile)) {
        return profile.education ? 4 : 3;
      }
      if (section.id === "preferences" && isAboutYouPhaseComplete(profile, prefs)) {
        return ABOUT_YOU_STEP_COUNT;
      }
      if (section.id === "contact" && isPreferencesComplete(profile, prefs)) {
        return CONTACT_STEP_INDEX;
      }
      if (section.id === "photo" && isContactComplete(profile)) {
        return PHOTO_STEP_INDEX;
      }
      return section.stepIndex;
    }
  }

  return STEPS.length;
}

export type EncouragementKey =
  | "encourageComplete"
  | "encourageAboutFirst"
  | "encourageAlmostDone"
  | "encourageHalfway"
  | "encourageDefault";

export function isMemberProfileReady(
  profile: Profile,
  prefs?: Preferences | null
): boolean {
  return calculateProfileProgress(profile, prefs) >= 100;
}

/** True while Convex profile/preferences queries have not resolved yet. */
export function isProfileQueriesLoading(
  profile: Profile | null | undefined,
  preferences: Preferences | null | undefined
): boolean {
  return profile === undefined || preferences === undefined;
}

export function getEncouragementKey(
  profile: Profile,
  prefs?: Preferences | null
): EncouragementKey {
  const progress = calculateProfileProgress(profile, prefs);
  const remaining = getRemainingSections(profile, prefs);

  if (progress >= 100) {
    return "encourageComplete";
  }
  if (!isAboutYouPhaseComplete(profile, prefs)) {
    return "encourageAboutFirst";
  }
  if (remaining <= 2) {
    return "encourageAlmostDone";
  }
  if (progress >= 50) {
    return "encourageHalfway";
  }
  return "encourageDefault";
}

export const LOCKED_FEATURES = [
  { label: "Matches", icon: "Heart" },
  { label: "Messages", icon: "MessageCircle" },
  { label: "Who Liked Me", icon: "Eye" },
] as const;
