import type { Profile } from "@prisma/client";

/**
 * Lightweight shared-value chips for match cards.
 * Keys map to premium.compat* translation labels on the frontend.
 */
export function computeHighlightKeys(
  viewer: Profile,
  target: Profile,
  limit = 2
): string[] {
  const keys: string[] = [];

  const push = (key: string, ok: boolean) => {
    if (ok && !keys.includes(key) && keys.length < limit) keys.push(key);
  };

  push(
    "religion",
    !!viewer.religiousLevel &&
      !!target.religiousLevel &&
      viewer.religiousLevel === target.religiousLevel
  );
  push(
    "country",
    !!viewer.country && !!target.country && viewer.country === target.country
  );
  push(
    "wantChildren",
    !!viewer.wantChildren &&
      !!target.wantChildren &&
      viewer.wantChildren === target.wantChildren
  );
  push(
    "timeline",
    !!viewer.marriageTimeline &&
      !!target.marriageTimeline &&
      viewer.marriageTimeline === target.marriageTimeline
  );
  push(
    "livingSituation",
    !!viewer.livingSituation &&
      !!target.livingSituation &&
      viewer.livingSituation === target.livingSituation
  );

  const viewerQualities = new Set(viewer.qualities ?? []);
  const sharedQualities = (target.qualities ?? []).filter((q) =>
    viewerQualities.has(q)
  );
  push("qualities", sharedQualities.length >= 2);

  const viewerHobbies = new Set(viewer.hobbies ?? []);
  const sharedHobbies = (target.hobbies ?? []).filter((h) =>
    viewerHobbies.has(h)
  );
  push("hobbies", sharedHobbies.length >= 2);

  return keys.slice(0, limit);
}

/** Stable daily pick index from userId + UTC date (YYYY-MM-DD). */
export function dailyPickIndex(userId: string, dayKey: string, modulo: number): number {
  if (modulo <= 0) return 0;
  let hash = 0;
  const input = `${userId}:${dayKey}`;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash % modulo;
}

export function utcDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
