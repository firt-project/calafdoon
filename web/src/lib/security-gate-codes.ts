export const SECURITY_GATE_CODES = {
  PASSWORD_RESET_REQUIRED: "PASSWORD_RESET_REQUIRED",
  EMAIL_VERIFICATION_REQUIRED: "EMAIL_VERIFICATION_REQUIRED",
  MFA_ENROLLMENT_REQUIRED: "MFA_ENROLLMENT_REQUIRED",
} as const;

export type SecurityGateCode =
  (typeof SECURITY_GATE_CODES)[keyof typeof SECURITY_GATE_CODES];

/** Soft-redirect when AuthGuard returns a restricted-session code. */
export function routeForSecurityGateCode(code: string | undefined): string | null {
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

/**
 * Navigate once for a security gate code. Server remains authoritative;
 * this only helps after mid-session 403s when /me flags are stale.
 */
export function redirectForSecurityGateCode(code: string | undefined): void {
  if (typeof window === "undefined") return;
  const dest = routeForSecurityGateCode(code);
  if (!dest) return;
  const path = window.location.pathname || "/";
  if (path === dest || path.startsWith(`${dest}/`)) return;
  window.location.assign(dest);
}
