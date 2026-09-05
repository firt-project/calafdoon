/**
 * Trimmed from apps/client/src/features/discover/types.ts — just the shape
 * and helpers the mobile Matches screen needs.
 */
export type DiscoverMember = {
  userId?: string;
  id?: string;
  name?: string;
  age?: number | string;
  city?: string;
  country?: string;
  score?: number;
  compatibilityScore?: number;
  imageUrl?: string;
  photoUrl?: string;
  online?: boolean;
  verified?: boolean;
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
