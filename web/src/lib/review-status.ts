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
  reviewStatus?: ReviewStatus | string;
  questionnaireComplete?: boolean;
  approved?: boolean;
  banned?: boolean;
  role?: string;
  gender?: string;
  hasPersonalSupport?: boolean;
  hasPaid?: boolean;
};

/**
 * Paid women on Basic need admin profile approval.
 * Men are never admin-approved — they become approved only after payment.
 * Premium women skip the review queue.
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

export function resolveReviewStatus(profile: ReviewProfile | null | undefined): ReviewStatus {
  if (!profile) return "incomplete";
  if (profile.banned) return "suspended";
  if (isStaffRole(profile.role)) return "approved";

  // Honor explicit status locks before generic approved flag heuristics.
  if (profile.reviewStatus === "paused") return "paused";
  if (profile.reviewStatus === "suspended") return "suspended";
  if (profile.reviewStatus === "rejected") return "rejected";
  if (profile.reviewStatus === "changes_requested") return "changes_requested";

  // Honor explicit admin approval before payment / completeness heuristics.
  if (profile.reviewStatus === "approved" || profile.approved === true) {
    return "approved";
  }

  // Unpaid members stay incomplete until payment (unless admin approved above).
  if (profile.questionnaireComplete && profile.hasPaid !== true) {
    return "incomplete";
  }

  // Men awaiting payment show incomplete until paid (unless admin approved above).
  if (
    profile.gender === "male" &&
    profile.questionnaireComplete &&
    !profile.approved
  ) {
    return "incomplete";
  }

  // Stale create-time "incomplete" after the member finished the form (and paid).
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

export function isProfileDiscoverable(profile: ReviewProfile | null | undefined): boolean {
  if (!profile) return false;
  if (profile.banned) return false;
  if (!profile.questionnaireComplete && !isStaffRole(profile.role)) return false;
  if (profile.hasPaid !== true && !isStaffRole(profile.role)) return false;
  if (profile.reviewStatus === "paused" || profile.reviewStatus === "suspended") {
    return false;
  }
  if (profile.reviewStatus === "changes_requested") return false;
  return resolveReviewStatus(profile) === "approved";
}

export function needsApprovalGate(profile: ReviewProfile | null | undefined): boolean {
  if (!profile || !requiresAdminProfileApproval(profile)) return false;
  const status = resolveReviewStatus(profile);
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
