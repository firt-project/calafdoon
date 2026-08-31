/** Soft-403 codes from Nest AuthGuard (M3 / M4 / L4). */

export const SECURITY_GATE_CODES = {
  PASSWORD_RESET_REQUIRED: "PASSWORD_RESET_REQUIRED",
  EMAIL_VERIFICATION_REQUIRED: "EMAIL_VERIFICATION_REQUIRED",
  MFA_ENROLLMENT_REQUIRED: "MFA_ENROLLMENT_REQUIRED",
} as const;

export type SecurityGateCode =
  (typeof SECURITY_GATE_CODES)[keyof typeof SECURITY_GATE_CODES];

export function routeForSecurityGateCode(
  code: string | undefined | null
): string | null {
  switch (code) {
    case SECURITY_GATE_CODES.PASSWORD_RESET_REQUIRED:
      return "/change-password";
    case SECURITY_GATE_CODES.EMAIL_VERIFICATION_REQUIRED:
      return "/verify-email";
    case SECURITY_GATE_CODES.MFA_ENROLLMENT_REQUIRED:
      return "/enroll-mfa";
    default:
      return null;
  }
}

export function messageForSecurityGateCode(
  code: string | undefined | null
): string | null {
  switch (code) {
    case SECURITY_GATE_CODES.PASSWORD_RESET_REQUIRED:
      return "You must change your password before continuing.";
    case SECURITY_GATE_CODES.EMAIL_VERIFICATION_REQUIRED:
      return "Verify your email to continue.";
    case SECURITY_GATE_CODES.MFA_ENROLLMENT_REQUIRED:
      return "Set up two-factor authentication to continue.";
    default:
      return null;
  }
}

/** Session-flag gate (precedence: password reset → email → MFA enroll). */
export function securityGateRouteForUser(user: {
  mustResetPassword?: boolean;
  emailVerified?: boolean;
  mfaEnrollmentRequired?: boolean;
  profile?: Record<string, unknown> | null;
} | null): string | null {
  if (!user) return null;
  const profile = (user.profile ?? {}) as {
    mustResetPassword?: boolean;
    emailVerified?: boolean;
    mfaEnrollmentRequired?: boolean;
  };
  if (user.mustResetPassword || profile.mustResetPassword) {
    return "/change-password";
  }
  // Absent emailVerified ⇒ verified (older Nest / already-cleared sessions).
  const verified =
    user.emailVerified !== false && profile.emailVerified !== false;
  if (!verified) return "/verify-email";
  if (user.mfaEnrollmentRequired || profile.mfaEnrollmentRequired) {
    return "/enroll-mfa";
  }
  return null;
}

const GATE_PATHS = new Set([
  "/change-password",
  "/verify-email",
  "/enroll-mfa",
  "/login",
  "/logout",
  "/forgot-password",
  "/reset-password",
  "/welcome",
  "/register",
]);

export function isSecurityGatePath(pathname: string): boolean {
  if (GATE_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/reset-password")) return true;
  if (pathname.startsWith("/verify-email")) return true;
  return false;
}
