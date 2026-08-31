/** Port of convex/lib/roles.ts + src/lib/access.ts — exact paid/staff rules. */

export type UserRole = "user" | "admin" | "owner";

export function isStaffRole(role?: string | null): role is "admin" | "owner" {
  return role === "admin" || role === "owner";
}

export function isOwnerRole(role?: string | null): role is "owner" {
  return role === "owner";
}

/**
 * Dating surfaces: members must never see admin/owner profiles.
 * Staff viewers can still see members (and each other) for support.
 */
export function shouldHideProfileFromViewer(
  viewerRole?: string | null,
  profileRole?: string | null
): boolean {
  return !isStaffRole(viewerRole) && isStaffRole(profileRole);
}

/**
 * App access: Stripe `hasPaid`, staff, or manual admin approval.
 * Waafi/EVC access ends when `paidUntil` has passed.
 * Trial fields are legacy and do NOT grant access.
 */
export function hasPaidAccess(
  profile:
    | {
        hasPaid?: boolean | null;
        role?: string | null;
        approved?: boolean | null;
        reviewStatus?: string | null;
        trialEndsAt?: Date | number | null;
        isInTrial?: boolean;
        paidUntil?: Date | number | string | null;
      }
    | null
    | undefined
): boolean {
  if (!profile) return false;
  if (isStaffRole(profile.role)) return true;
  // Admin can grant access without Stripe by approving the profile.
  if (profile.approved === true || profile.reviewStatus === "approved") {
    return true;
  }
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

/** Premium = hasPersonalSupport or legacy paidCents >= 2000. */
export function isPremiumMember(
  profile:
    | {
        hasPersonalSupport?: boolean | null;
        paidCents?: number | null;
      }
    | null
    | undefined
): boolean {
  if (!profile) return false;
  if (profile.hasPersonalSupport === true) return true;
  if ((profile.paidCents ?? 0) >= 2000) return true;
  return false;
}

export const STAFF_PROFILE_COMPLETION_PATCH = {
  questionnaireComplete: true as const,
  registrationComplete: true as const,
  questionnaireStep: 11,
  approved: true as const,
  verified: false as const,
  reviewStatus: "approved" as const,
  hasPaid: true as const,
};
