/** Port of convex/lib/genderLock.ts */

export function isGenderLocked(profile: {
  hasPaid?: boolean | null;
  genderLocked?: boolean | null;
}): boolean {
  return profile.hasPaid === true || profile.genderLocked === true;
}

export function assertGenderMutable(
  profile: {
    hasPaid?: boolean | null;
    genderLocked?: boolean | null;
    gender?: string | null;
  },
  nextGender: "male" | "female"
): void {
  if (nextGender === profile.gender) return;
  if (isGenderLocked(profile)) {
    throw new Error(
      "Gender cannot be changed after payment. Contact support if this was a mistake."
    );
  }
}
