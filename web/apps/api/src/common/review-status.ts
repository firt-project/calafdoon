/** Port of convex/lib/reviewStatus.ts — exact review / discoverability rules. */

import { isStaffRole } from "./access";

export const REVIEW_STATUSES = [
  "incomplete",
  "pending_review",
  "approved",
  "rejected",
  "suspended",
  "paused",
  "changes_requested",
] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

type ReviewProfile = {
  reviewStatus?: ReviewStatus | string | null;
  questionnaireComplete?: boolean | null;
  approved?: boolean | null;
  banned?: boolean | null;
  role?: string | null;
  gender?: string | null;
  hasPersonalSupport?: boolean | null;
  hasPaid?: boolean | null;
};

/**
 * Paid women on Basic need admin profile approval.
 * Men are never admin-approved — they become approved only after payment.
 * Premium women skip the review queue. Unpaid women are not in the queue yet.
 */
export function requiresAdminProfileApproval(
  profile:
    | Pick<ReviewProfile, "role" | "gender" | "hasPersonalSupport" | "hasPaid">
    | null
    | undefined
): boolean {
  if (!profile || isStaffRole(profile.role)) return false;
  if (profile.hasPaid !== true) return false;
  return profile.gender === "female" && profile.hasPersonalSupport !== true;
}

export function resolveReviewStatus(profile: ReviewProfile): ReviewStatus {
  if (profile.banned) return "suspended";
  if (isStaffRole(profile.role)) return "approved";

  if (profile.reviewStatus === "approved" || profile.approved === true) {
    // Paused/suspended take precedence over the approved boolean.
    if (profile.reviewStatus === "paused") return "paused";
    if (profile.reviewStatus === "suspended") return "suspended";
    if (profile.reviewStatus === "changes_requested") return "changes_requested";
    return "approved";
  }

  if (
    profile.reviewStatus === "rejected" ||
    profile.reviewStatus === "suspended" ||
    profile.reviewStatus === "paused" ||
    profile.reviewStatus === "changes_requested"
  ) {
    return profile.reviewStatus;
  }

  if (
    profile.questionnaireComplete &&
    profile.hasPaid !== true &&
    !isStaffRole(profile.role)
  ) {
    return "incomplete";
  }

  if (
    profile.gender === "male" &&
    profile.questionnaireComplete &&
    !profile.approved
  ) {
    return "incomplete";
  }

  if (profile.reviewStatus === "incomplete" && profile.questionnaireComplete) {
    return profile.approved ? "approved" : "pending_review";
  }

  if (
    profile.reviewStatus === "incomplete" ||
    profile.reviewStatus === "pending_review"
  ) {
    return profile.reviewStatus;
  }

  if (profile.approved && profile.questionnaireComplete) return "approved";
  if (profile.questionnaireComplete) return "pending_review";
  return "incomplete";
}

export function isDiscoverable(profile: ReviewProfile): boolean {
  if (profile.banned) return false;
  // Staff accounts are never shown to members in Discover / matching.
  if (isStaffRole(profile.role)) return false;
  if (!profile.questionnaireComplete) return false;
  if (profile.hasPaid !== true) return false;
  if (profile.reviewStatus === "paused" || profile.reviewStatus === "suspended") {
    return false;
  }
  if (profile.reviewStatus === "changes_requested") return false;
  return resolveReviewStatus(profile) === "approved";
}

export function needsApprovalGate(
  profile: ReviewProfile | null | undefined
): boolean {
  if (!requiresAdminProfileApproval(profile)) return false;
  const status = resolveReviewStatus(profile ?? {});
  return (
    status === "pending_review" ||
    status === "rejected" ||
    status === "changes_requested"
  );
}

/** Banned, paused, or timed-suspension — no matches/messaging. */
export function isInteractionLocked(
  profile: ReviewProfile | null | undefined
): boolean {
  if (!profile) return false;
  if (profile.banned) return true;
  const status = resolveReviewStatus(profile);
  return status === "paused" || status === "suspended";
}

export function interactionLockMessage(
  profile: ReviewProfile | null | undefined
): string {
  if (!profile) return "Account unavailable";
  if (profile.banned) return "Account suspended";
  const status = resolveReviewStatus(profile);
  if (status === "paused") return "Account paused";
  if (status === "suspended") return "Account suspended";
  return "Account unavailable";
}
