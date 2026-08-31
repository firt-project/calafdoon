export type LookingForPrefs = {
  minAge?: number;
  maxAge?: number;
  preferredCountries?: string[];
  educationLevel?: string;
  religiousLevel?: string;
  acceptChildren?: string;
  acceptDivorcee?: string;
  acceptWidow?: string;
  readyToRelocate?: string;
  qualities?: string[];
  hobbies?: string[];
};

export type DiscoverMember = {
  userId?: string;
  id?: string;
  name?: string;
  age?: number | string;
  gender?: string;
  city?: string;
  country?: string;
  height?: number;
  score?: number;
  compatibilityScore?: number;
  bio?: string;
  imageUrl?: string;
  photoUrl?: string;
  languagesSpoken?: string[];
  prayerFrequency?: string;
  madhhab?: string;
  interests?: string[];
  hobbies?: string[];
  qualities?: string[];
  verified?: boolean;
  advisorReviewed?: boolean;
  education?: string;
  occupation?: string;
  maritalStatus?: string;
  marriageTimeline?: string;
  wantChildren?: string;
  marrySomeoneWithChildren?: string;
  familyInvolvement?: string;
  livingSituation?: string;
  readyToRelocate?: string;
  financialReadiness?: string;
  marriageWorkPreference?: string;
  exercise?: string;
  smokes?: string;
  drinksAlcohol?: string;
  polygynyOpenness?: string;
  loveLanguage?: string;
  children?: number;
  additionalImageUrls?: string[];
  religiousLevel?: string;
  online?: boolean;
  lastSeenAt?: string | null;
  liked?: boolean;
  shortlisted?: boolean;
  lookingFor?: LookingForPrefs | null;
};

export function memberId(m: DiscoverMember): string {
  return String(m.userId ?? m.id ?? "");
}

export function memberPhoto(m: DiscoverMember): string | null {
  return m.imageUrl || m.photoUrl || null;
}

export function memberPlace(m: DiscoverMember): string {
  return [m.city, m.country].filter(Boolean).join(", ");
}

export function memberScore(m: DiscoverMember): number | null {
  const s = m.score ?? m.compatibilityScore;
  if (s == null) return null;
  const n = Math.round(Number(s));
  return Number.isNaN(n) ? null : n;
}

export function memberChips(m: DiscoverMember, max = 3): string[] {
  const out: string[] = [];
  if (m.prayerFrequency) out.push(String(m.prayerFrequency));
  for (const lang of m.languagesSpoken ?? []) {
    if (out.length >= max) break;
    out.push(String(lang));
  }
  for (const h of m.hobbies ?? m.interests ?? []) {
    if (out.length >= max) break;
    out.push(String(h));
  }
  return out.slice(0, max);
}
