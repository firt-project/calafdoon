export type UserRole = "user" | "admin" | "owner";

export function isStaffRole(role?: string): role is "admin" | "owner" {
  return role === "admin" || role === "owner";
}

export function isOwnerRole(role?: string): role is "owner" {
  return role === "owner";
}

export function hasPaidAccess(
  profile:
    | {
        hasPaid?: boolean;
        role?: string;
        trialEndsAt?: number;
        isInTrial?: boolean;
        gender?: string;
        paidUntil?: number | string | Date | null;
      }
    | null
    | undefined
): boolean {
  if (!profile) return false;
  if (isStaffRole(profile.role)) return true;
  if (!profile.hasPaid) return false;
  // Waafi/EVC: access ends when paidUntil has passed.
  if (profile.paidUntil != null) {
    const until =
      typeof profile.paidUntil === "number"
        ? profile.paidUntil
        : new Date(profile.paidUntil).getTime();
    if (!Number.isFinite(until) || until <= Date.now()) return false;
  }
  return true;
}

/** Premium = WhatsApp personal support + staff search help (not extra app locks). */
export function isPremiumMember(
  profile:
    | {
        hasPersonalSupport?: boolean;
        trialEndsAt?: number;
        hasPaid?: boolean;
        isInTrial?: boolean;
        paidCents?: number;
      }
    | null
    | undefined
): boolean {
  if (!profile) return false;
  if (profile.hasPersonalSupport === true) return true;
  // Legacy Premium was $20 — do not treat old $10 Basic payments as Premium.
  if ((profile.paidCents ?? 0) >= 2000) return true;
  return false;
}
