/** Port of profilePassesMatchFilters from convex/lib/matchPresentation.ts */

import { effectiveReligiousLevel } from "../profile/profile-enrichment";

export type MatchFilterArgs = {
  country?: string;
  city?: string;
  minAge?: number;
  maxAge?: number;
  minHeight?: number;
  maxHeight?: number;
  religiousLevel?: string;
  education?: string;
  occupation?: string;
  children?: number;
  maritalStatus?: string;
  marriageTimeline?: string;
};

export function profilePassesMatchFilters(
  profile: {
    country: string;
    city: string;
    age: number;
    height: number;
    religiousLevel?: string | null;
    prayerFrequency?: string | null;
    education: string;
    occupation: string;
    children: number;
    maritalStatus: string;
    marriageTimeline: string;
  },
  args: MatchFilterArgs
): boolean {
  if (args.country && profile.country !== args.country) return false;
  if (
    args.city &&
    !profile.city.toLowerCase().includes(args.city.toLowerCase())
  ) {
    return false;
  }
  if (args.minAge && profile.age < args.minAge) return false;
  if (args.maxAge && profile.age > args.maxAge) return false;
  if (args.minHeight && profile.height < args.minHeight) return false;
  if (args.maxHeight && profile.height > args.maxHeight) return false;
  if (
    args.religiousLevel &&
    effectiveReligiousLevel(profile) !== args.religiousLevel
  ) {
    return false;
  }
  if (args.education && profile.education !== args.education) return false;
  if (args.occupation && profile.occupation !== args.occupation) return false;
  if (args.children !== undefined && profile.children !== args.children) {
    return false;
  }
  if (args.maritalStatus && profile.maritalStatus !== args.maritalStatus) {
    return false;
  }
  if (
    args.marriageTimeline &&
    profile.marriageTimeline !== args.marriageTimeline
  ) {
    return false;
  }
  return true;
}
