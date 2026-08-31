/** Routes that use the in-app dashboard shell (no marketing navbar/footer). */
export const APP_SHELL_ROUTES = [
  "/dashboard",
  "/profile",
  "/matches",
  "/likes",
  "/chat",
  "/questionnaire",
  "/payment",
  "/notifications",
  "/admin",
] as const;

export const AUTH_ROUTES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/change-password",
  "/enroll-mfa",
  "/admin/invite",
] as const;

export const REGISTRATION_ROUTES = ["/register/details"] as const;

export function isAppShellRoute(pathname: string): boolean {
  return APP_SHELL_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

export function isAuthRoute(pathname: string): boolean {
  return (
    AUTH_ROUTES.some(
      (route) => pathname === route || pathname.startsWith(`${route}/`)
    ) ||
    REGISTRATION_ROUTES.some(
      (route) => pathname === route || pathname.startsWith(`${route}/`)
    )
  );
}

export function isMarketingRoute(pathname: string): boolean {
  return !isAppShellRoute(pathname) && !isAuthRoute(pathname);
}

import { hasPaidAccess, isStaffRole } from "./access";

/** Where signed-in users should land instead of the marketing homepage. */
export function getAuthenticatedHomeRoute(
  profile:
    | {
        registrationComplete?: boolean;
        questionnaireComplete?: boolean;
        hasPaid?: boolean;
        paidUntil?: number | string | Date | null;
        trialEndsAt?: number;
        role?: string;
      }
    | null
    | undefined
): string {
  // Admins and owners never go through the member flow (payment/questionnaire).
  if (isStaffRole(profile?.role)) {
    return "/admin";
  }
  if (profile?.registrationComplete === false) {
    return "/register/details";
  }
  if (!profile?.questionnaireComplete) {
    return "/questionnaire";
  }
  if (!hasPaidAccess(profile)) {
    return "/payment";
  }
  return "/dashboard";
}
