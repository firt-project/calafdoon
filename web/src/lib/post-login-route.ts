import { getAuthenticatedHomeRoute } from "@/lib/routes";
import { routeForSecurityGateCode } from "@/lib/security-gate-codes";
import type { AccessStateLike, SessionUser } from "@/data/types";

/**
 * Login HTTP success is not enough: the browser must be able to call
 * authenticated routes with the session cookie. Gate the welcome toast /
 * post-login navigation on a confirmed `/auth/me` user.
 */
export function isLoginSessionConfirmed(
  user: SessionUser | null | undefined
): user is SessionUser {
  return Boolean(user?.id);
}

/**
 * Where to send the user right after a successful login / MFA verify.
 * Precedence: security gates → Nest accessState.nextRoute → profile home.
 */
export function getPostLoginRoute(
  user: SessionUser | null | undefined,
  accessState?: AccessStateLike | null
): string {
  if (!user) return "/login";

  if (user.mustResetPassword === true) return "/change-password";
  if (user.emailVerified === false) return "/verify-email";
  if (user.mfaEnrollmentRequired === true) return "/enroll-mfa";

  const next = String(accessState?.nextRoute ?? "").trim();
  if (next) {
    if (next.includes("admin")) return "/admin";
    if (next.includes("register")) return "/register/details";
    if (next.includes("questionnaire")) return "/questionnaire";
    if (next.includes("payment")) return "/payment";
    if (next.includes("dashboard") || next.includes("matches") || next === "/home") {
      return "/dashboard";
    }
    if (next.includes("login")) return "/login";
  }

  const profile =
    (user.profile as Parameters<typeof getAuthenticatedHomeRoute>[0]) ??
    ({
      role: user.role as string | undefined,
      hasPaid: user.hasPaid as boolean | undefined,
      questionnaireComplete: accessState?.questionnaireComplete,
      registrationComplete:
        typeof accessState?.registrationComplete === "boolean"
          ? accessState.registrationComplete
          : typeof accessState?.genderComplete === "boolean"
            ? accessState.genderComplete
            : undefined,
    } as Parameters<typeof getAuthenticatedHomeRoute>[0]);

  return getAuthenticatedHomeRoute(profile);
}

/** Soft-403 body code → in-app route (same gates as session flags). */
export function getPostLoginRouteFromGateCode(code: string | undefined): string | null {
  return routeForSecurityGateCode(code);
}
