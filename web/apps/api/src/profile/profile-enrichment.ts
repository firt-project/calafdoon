/** Port of convex/lib/profileEnrichment.ts */

export const QUESTIONNAIRE_COMPLETE_STEP = 11;

export function religiousLevelFromPrayer(prayerFrequency: string): string {
  switch (prayerFrequency) {
    case "Always":
      return "Very Practicing";
    case "Most of the time":
      return "Practicing";
    case "Sometimes":
      return "Moderate";
    case "Rarely":
      return "Less Practicing";
    default:
      return "";
  }
}

export function effectiveReligiousLevel(profile: {
  religiousLevel?: string | null;
  prayerFrequency?: string | null;
}): string {
  if (profile.religiousLevel?.trim()) return profile.religiousLevel;
  if (profile.prayerFrequency?.trim()) {
    return religiousLevelFromPrayer(profile.prayerFrequency);
  }
  return "";
}

export function enrichProfileUpdates(
  updates: Record<string, unknown>
): Record<string, unknown> {
  const enriched = { ...updates };
  if (typeof enriched.prayerFrequency === "string" && enriched.prayerFrequency) {
    enriched.religiousLevel = religiousLevelFromPrayer(enriched.prayerFrequency);
  }
  for (const key of ["wearsHijab", "hasBeard"] as const) {
    const val = enriched[key];
    if (val === "Yes") enriched[key] = true;
    else if (val === "No") enriched[key] = false;
  }
  return enriched;
}
