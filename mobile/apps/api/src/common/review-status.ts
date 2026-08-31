/** Port of convex/lib/reviewStatus.ts — exact review / discoverability rules. */

import { isStaffRole } from "./access";

export const REVIEW_STATUSES = [
  "incomplete",
  "pending_review",
  "approved",
  "rejected",
  "suspended",
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
    return "approved";
  }

  if (
    profile.reviewStatus === "rejected" ||
    profile.reviewStatus === "suspended"
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
  // Paid (Stripe) or manually admin-approved — then must be approved for discovery.
  if (
    profile.hasPaid !== true &&
    profile.approved !== true &&
    profile.reviewStatus !== "approved"
  ) {
    return false;
  }
  return resolveReviewStatus(profile) === "approved";
}

export function needsApprovalGate(
  profile: ReviewProfile | null | undefined
): boolean {
  if (!requiresAdminProfileApproval(profile)) return false;
  const status = resolveReviewStatus(profile ?? {});
  return status === "pending_review" || status === "rejected";
}
