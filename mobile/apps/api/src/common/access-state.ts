/** Port of src/lib/routes.ts getAuthenticatedHomeRoute + access-state flags. */

import { hasPaidAccess, isPremiumMember, isStaffRole } from "./access";
import {
  needsApprovalGate,
  resolveReviewStatus,
  type ReviewStatus,
} from "./review-status";

export const ROUTES = {
  admin: "/admin",
  registerDetails: "/register/details",
  questionnaire: "/questionnaire",
  payment: "/payment",
  matches: "/matches",
  dashboard: "/dashboard",
} as const;

export type AccessProfileInput = {
  registrationComplete?: boolean | null;
  questionnaireComplete?: boolean | null;
  hasPaid?: boolean | null;
  role?: string | null;
  banned?: boolean | null;
  gender?: "male" | "female" | string | null;
  approved?: boolean | null;
  reviewStatus?: string | null;
  hasPersonalSupport?: boolean | null;
  paidCents?: number | null;
  genderLocked?: boolean | null;
  waliName?: string | null;
  waliPhone?: string | null;
  profileImageConvexId?: string | null;
  profileImageMediaId?: string | null;
};

export type AccessState = {
  authenticated: boolean;
  banned: boolean;
  role: "user" | "admin" | "owner";
  profileExists: boolean;
  genderComplete: boolean;
  questionnaireComplete: boolean;
  hasPaid: boolean;
  hasPaidAccess: boolean;
  approved: boolean;
  reviewStatus: ReviewStatus;
  isPremium: boolean;
  hasPersonalSupport: boolean;
  waliComplete: boolean;
  needsApprovalGate: boolean;
  genderLocked: boolean;
  nextRoute: string;
};

export function getAuthenticatedHomeRoute(
  profile: AccessProfileInput | null | undefined
): string {
  if (isStaffRole(profile?.role)) return ROUTES.admin;
  if (profile?.registrationComplete === false) return ROUTES.registerDetails;
  if (!profile?.questionnaireComplete) return ROUTES.questionnaire;
  if (!hasPaidAccess(profile)) return ROUTES.payment;
  return ROUTES.dashboard;
}

export function computeAccessState(opts: {
  authenticated: boolean;
  profile: AccessProfileInput | null | undefined;
}): AccessState {
  const profile = opts.profile;
  const role = (profile?.role as AccessState["role"]) ?? "user";
  const banned = !!profile?.banned;
  const profileExists = !!profile;
  const genderComplete = profile?.registrationComplete !== false && profileExists;
  const questionnaireComplete = !!profile?.questionnaireComplete;
  const hasPaid = !!profile?.hasPaid;
  const paidAccess = hasPaidAccess(profile);
  const reviewStatus = profile
    ? resolveReviewStatus(profile)
    : ("incomplete" as ReviewStatus);
  const isPremium = isPremiumMember(profile);
  const waliComplete = !!(
    profile?.waliName?.trim() &&
    profile?.waliPhone &&
    profile.waliPhone.trim().length >= 8
  );

  return {
    authenticated: opts.authenticated,
    banned,
    role,
    profileExists,
    genderComplete: profileExists ? genderComplete : false,
    questionnaireComplete,
    hasPaid,
    hasPaidAccess: paidAccess,
    approved: !!profile?.approved,
    reviewStatus,
    isPremium,
    hasPersonalSupport: !!profile?.hasPersonalSupport,
    waliComplete,
    needsApprovalGate: needsApprovalGate(profile ?? undefined),
    genderLocked:
      profile?.hasPaid === true || profile?.genderLocked === true,
    nextRoute: banned
      ? "/login"
      : getAuthenticatedHomeRoute(profileExists ? profile : { registrationComplete: false }),
  };
}
