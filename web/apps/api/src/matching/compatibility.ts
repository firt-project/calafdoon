import { effectiveReligiousLevel } from "../profile/profile-enrichment";

const RELIGIOUS_SCORES: Record<string, number> = {
  "Very Practicing": 4,
  Practicing: 3,
  Moderate: 2,
  "Less Practicing": 1,
};

const PRAYER_SCORES: Record<string, number> = {
  Always: 4,
  "Most of the time": 3,
  Sometimes: 2,
  Rarely: 1,
};

const EDUCATION_SCORES: Record<string, number> = {
  "High School": 1,
  Diploma: 2,
  Bachelor: 3,
  Master: 4,
  PhD: 5,
  Other: 2,
};

const TIMELINE_SCORES: Record<string, number> = {
  Immediately: 4,
  "Within 6 months": 3,
  "Within 1 year": 2,
  "No timeline": 1,
};

/** Country is a light preference (~8%), not a hard gate — other countries stay visible. */
const COUNTRY_MAX_SCORE = 8;

function spousePrayerScore(
  importance: string | undefined,
  candidatePrayer: string | undefined
): number {
  const prayer = PRAYER_SCORES[candidatePrayer ?? ""] ?? 0;
  if (!importance || importance === "No preference") return 5;
  if (importance === "Very important") {
    return prayer >= 3 ? 5 : prayer >= 2 ? 3 : 0;
  }
  if (importance === "Preferred") {
    return prayer >= 2 ? 5 : prayer >= 1 ? 3 : 0;
  }
  return 3;
}

export type CompatibilityBreakdownItem = {
  key: string;
  score: number;
  maxScore: number;
};

export function calculateCompatibilityBreakdown(
  user: Profile,
  userPrefs: Preferences,
  candidate: Profile,
  _candidatePrefs: Preferences
): { total: number; categories: CompatibilityBreakdownItem[] } {
  const categories: CompatibilityBreakdownItem[] = [];
  const push = (key: string, score: number, maxScore: number) => {
    categories.push({ key, score, maxScore });
  };

  const userRel = RELIGIOUS_SCORES[effectiveReligiousLevel(user)] ?? 2;
  const candRel = RELIGIOUS_SCORES[effectiveReligiousLevel(candidate)] ?? 2;
  const relDiff = Math.abs(userRel - candRel);
  push("religion", Math.max(0, 25 - relDiff * 8), 25);

  push(
    "prayer",
    spousePrayerScore(user.spousePrayerImportance, candidate.prayerFrequency),
    5
  );

  let ageScore = 0;
  if (candidate.age >= userPrefs.minAge && candidate.age <= userPrefs.maxAge) {
    ageScore = 15;
  } else {
    const diff = Math.min(
      Math.abs(candidate.age - userPrefs.minAge),
      Math.abs(candidate.age - userPrefs.maxAge)
    );
    ageScore = Math.max(0, 15 - diff * 3);
  }
  push("age", ageScore, 15);

  let countryScore = 0;
  if (
    userPrefs.preferredCountries.length === 0 ||
    userPrefs.preferredCountries.includes(candidate.country)
  ) {
    countryScore = COUNTRY_MAX_SCORE;
  } else if (user.country === candidate.country) {
    countryScore = COUNTRY_MAX_SCORE / 2;
  }
  push("country", countryScore, COUNTRY_MAX_SCORE);

  let heightScore = 0;
  if (candidate.height >= userPrefs.minHeight && candidate.height <= userPrefs.maxHeight) {
    heightScore = 5;
  } else {
    const diff = Math.min(
      Math.abs(candidate.height - userPrefs.minHeight),
      Math.abs(candidate.height - userPrefs.maxHeight)
    );
    heightScore = Math.max(0, 5 - diff);
  }
  push("height", heightScore, 5);

  let weightScore = 0;
  const minWeight = userPrefs.minWeight ?? 45;
  const maxWeight = userPrefs.maxWeight ?? 150;
  if (candidate.weight >= minWeight && candidate.weight <= maxWeight) {
    weightScore = 3;
  } else {
    const diff = Math.min(
      Math.abs(candidate.weight - minWeight),
      Math.abs(candidate.weight - maxWeight)
    );
    weightScore = Math.max(0, 3 - Math.floor(diff / 5));
  }
  push("weight", weightScore, 3);

  const userEdu = EDUCATION_SCORES[userPrefs.educationLevel] ?? 2;
  const candEdu = EDUCATION_SCORES[candidate.education] ?? 2;
  const eduDiff = Math.abs(userEdu - candEdu);
  push("education", Math.max(0, 8 - eduDiff * 2), 8);

  let childrenScore = 0;
  if (user.marrySomeoneWithChildren === "No") {
    if (candidate.children === 0) childrenScore = 8;
  } else if (userPrefs.acceptChildren === "Yes") {
    childrenScore = 8;
  } else if (userPrefs.acceptChildren === "Depends" && candidate.children === 0) {
    childrenScore = 8;
  } else if (userPrefs.acceptChildren === "No" && candidate.children === 0) {
    childrenScore = 8;
  }
  push("children", childrenScore, 8);

  let maritalScore = 0;
  const candidatePreviouslyMarried =
    candidate.maritalStatus === "Divorced" || candidate.maritalStatus === "Widowed";
  if (candidate.maritalStatus === "Never married" || candidate.maritalStatus === "Never Married") {
    maritalScore = 5;
  } else if (candidate.maritalStatus === "Divorced") {
    if (userPrefs.acceptDivorcee === "No") maritalScore = 0;
    else if (userPrefs.acceptDivorcee === "Yes") maritalScore = 5;
    else maritalScore = 4;
  } else if (candidate.maritalStatus === "Widowed") {
    if (userPrefs.acceptWidow === "No") maritalScore = 0;
    else if (userPrefs.acceptWidow === "Yes") maritalScore = 5;
    else maritalScore = 4;
  }
  if (
    user.gender === "female" &&
    candidatePreviouslyMarried &&
    user.acceptPreviouslyMarriedMan
  ) {
    if (user.acceptPreviouslyMarriedMan === "No") maritalScore = 0;
    else if (user.acceptPreviouslyMarriedMan === "Yes") maritalScore = Math.max(maritalScore, 5);
    else maritalScore = Math.max(maritalScore, 4);
  }
  push("maritalStatus", maritalScore, 5);

  const sharedQualities = user.qualities.filter((q) => candidate.qualities.includes(q));
  push(
    "qualities",
    Math.min(8, (sharedQualities.length / Math.max(user.qualities.length, 1)) * 8),
    8
  );

  const sharedHobbies = user.hobbies.filter((h) => candidate.hobbies.includes(h));
  push(
    "hobbies",
    Math.min(4, (sharedHobbies.length / Math.max(user.hobbies.length, 1)) * 4),
    4
  );

  const userTimeline = TIMELINE_SCORES[user.marriageTimeline] ?? 2;
  const candTimeline = TIMELINE_SCORES[candidate.marriageTimeline] ?? 2;
  const timelineDiff = Math.abs(userTimeline - candTimeline);
  push("timeline", Math.max(0, 7 - timelineDiff * 2), 7);

  push("wantChildren", wantChildrenScore(user.wantChildren, candidate.wantChildren), 4);

  let livingScore = 0;
  if (user.livingSituation && candidate.livingSituation) {
    livingScore = livingArrangementScore(user, candidate);
  }
  push("livingSituation", livingScore, 2);

  let languageScore = 0;
  if (user.languagesSpoken?.length && candidate.languagesSpoken?.length) {
    const sharedLang = user.languagesSpoken.filter((l) =>
      candidate.languagesSpoken!.includes(l)
    );
    languageScore = Math.min(2, sharedLang.length);
  }
  push("languages", languageScore, 2);

  push("appearance", appearancePrefScore(user, userPrefs, candidate), 3);
  push("polygyny", polygynyCompatibilityScore(user, candidate), 2);

  const rawTotal = categories.reduce((sum, item) => sum + item.score, 0);
  const total = Math.round(Math.min(100, Math.max(0, rawTotal)));

  return { total, categories };
}

export function calculateCompatibility(
  user: Profile,
  userPrefs: Preferences,
  candidate: Profile,
  candidatePrefs: Preferences
): number {
  return calculateCompatibilityBreakdown(user, userPrefs, candidate, candidatePrefs)
    .total;
}

function wantChildrenScore(userWant?: string, candWant?: string): number {
  if (!userWant || !candWant) return 2;
  if (userWant === candWant) return 4;
  if (userWant === "Maybe" || candWant === "Maybe") return 3;
  if (
    (userWant === "Yes" || userWant === "Already have and open to more") &&
    (candWant === "Yes" || candWant === "Already have and open to more")
  ) {
    return 4;
  }
  if (userWant === "No" && candWant === "No") return 4;
  if (userWant === "No" || candWant === "No") return 0;
  return 2;
}

function appearancePrefScore(
  user: Profile,
  prefs: Preferences,
  candidate: Profile
): number {
  if (user.gender === "female") {
    return 3;
  }
  if (user.gender === "male") {
    const pref = prefs.partnerHijabLevel;
    if (!pref || pref === "No preference") return 3;
    if (candidate.wearsHijab === true) return 3;
    if (candidate.wearsHijab === false) return pref === "No preference" ? 3 : 1;
    return 2;
  }
  return 2;
}

function livingArrangementScore(user: Profile, candidate: Profile): number {
  const a = user.livingSituation;
  const b = candidate.livingSituation;
  if (!a || !b) return 1;
  if (a === b) return 2;
  if (a === "Open to discuss" || b === "Open to discuss") return 2;

  const maleFemalePairs: [string, string][] = [
    ["Own home with my wife", "Own home with my husband"],
    ["With my parents or family", "With my husband's family"],
    ["Separate home near my family", "Separate home near his family"],
  ];

  for (const [maleVal, femaleVal] of maleFemalePairs) {
    const aligned =
      (user.gender === "male" &&
        candidate.gender === "female" &&
        a === maleVal &&
        b === femaleVal) ||
      (user.gender === "female" &&
        candidate.gender === "male" &&
        a === femaleVal &&
        b === maleVal);
    if (aligned) return 2;
  }

  // Legacy profiles (location-style answers)
  const legacyCompatible: Record<string, string[]> = {
    "Own home": ["Own home with my wife", "Own home with my husband"],
    "With family": ["With my parents or family", "With my husband's family"],
    "Same city": ["Separate home near my family", "Separate home near his family"],
    "Same country": ["Open to discuss"],
    "Open to abroad": ["Open to discuss"],
  };
  if (legacyCompatible[a]?.includes(b) || legacyCompatible[b]?.includes(a)) return 1;

  return 0;
}

function polygynyScore(userVal?: string, candVal?: string): number {
  if (!userVal || !candVal) return 1;
  if (userVal === candVal) return 2;
  if (userVal === "Maybe" || candVal === "Maybe") return 1;
  return 0;
}

function polygynyCompatibilityScore(user: Profile, candidate: Profile): number {
  const man = user.gender === "male" ? user : candidate.gender === "male" ? candidate : null;
  const woman =
    user.gender === "female" ? user : candidate.gender === "female" ? candidate : null;

  if (!man || !woman) {
    return polygynyScore(user.polygynyOpenness, candidate.polygynyOpenness);
  }

  const usesNewFields =
    !!man.hasCurrentWife ||
    !!man.openToSecondWife ||
    !!woman.acceptFutureCoWife;

  if (!usesNewFields) {
    return polygynyScore(user.polygynyOpenness, candidate.polygynyOpenness);
  }

  const currentWifeScore =
    man.hasCurrentWife === "Yes" ? 0.5 : 1;
  const futureWifeScore = scorePolygynyAlignment(
    man.openToSecondWife === "Yes" || man.openToSecondWife === "Maybe",
    woman.acceptFutureCoWife,
    man.openToSecondWife === "Maybe"
  );

  return currentWifeScore + futureWifeScore;
}

function scorePolygynyAlignment(
  manSituation: boolean,
  womanAccept?: string,
  manMaybe = false
): number {
  if (!manSituation) return 1;
  if (!womanAccept) return 0.5;
  if (womanAccept === "Yes") return 1;
  if (womanAccept === "Maybe") return manMaybe ? 0.75 : 0.5;
  return 0;
}

export interface Profile {
  religiousLevel: string;
  prayerFrequency?: string;
  spousePrayerImportance?: string;
  age: number;
  country: string;
  city?: string;
  height: number;
  weight: number;
  education: string;
  maritalStatus: string;
  children: number;
  qualities: string[];
  hobbies: string[];
  marriageTimeline: string;
  marrySomeoneWithChildren?: string;
  gender: "male" | "female";
  wantChildren?: string;
  livingSituation?: string;
  polygynyOpenness?: string;
  hasCurrentWife?: string;
  openToSecondWife?: string;
  acceptManWithWife?: string;
  acceptPreviouslyMarriedMan?: string;
  acceptFutureCoWife?: string;
  languagesSpoken?: string[];
  citizenshipStatus?: string;
  financialReadiness?: string;
  marriageWorkPreference?: string;
  wearsHijab?: boolean;
  hasBeard?: boolean;
  smokes?: string;
}

export interface Preferences {
  minAge: number;
  maxAge: number;
  minHeight: number;
  maxHeight: number;
  minWeight?: number;
  maxWeight?: number;
  preferredCountries: string[];
  acceptChildren: string;
  educationLevel: string;
  acceptDivorcee: string;
  acceptWidow: string;
  preferredGender: "male" | "female";
  qualities: string[];
  hobbies: string[];
  partnerBeard?: string;
  partnerHijabLevel?: string;
}

export { effectiveReligiousLevel };
