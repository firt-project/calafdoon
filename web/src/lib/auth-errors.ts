import type { TranslationPath } from "@/lib/i18n/translations";
import { getSafeUserError, isTechnicalErrorMessage } from "@/lib/safe-error";
import { ApiClientError } from "@/data/api-client";
import { SECURITY_GATE_CODES } from "@/lib/security-gate-codes";

type TranslateFn = (key: TranslationPath) => string;

export function isUnknownAccountError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes("InvalidAccountId");
}

/** Safe user-facing auth errors — never echo raw Convex / server text. */
export function getAuthErrorMessage(
  error: unknown,
  fallback: string,
  t?: TranslateFn
): string {
  if (error instanceof ApiClientError && error.code) {
    if (error.code === SECURITY_GATE_CODES.PASSWORD_RESET_REQUIRED) {
      return t?.("auth.errorPasswordResetRequired") ?? fallback;
    }
    if (error.code === SECURITY_GATE_CODES.EMAIL_VERIFICATION_REQUIRED) {
      return t?.("auth.errorEmailVerificationRequired") ?? fallback;
    }
    if (error.code === SECURITY_GATE_CODES.MFA_ENROLLMENT_REQUIRED) {
      return t?.("auth.errorMfaEnrollmentRequired") ?? fallback;
    }
    if (error.code === "SESSION_NOT_ESTABLISHED") {
      return t?.("auth.sessionNotEstablished") ?? fallback;
    }
    if (error.status === 429) {
      return t?.("auth.errorTooManyAttempts") ?? fallback;
    }
  }

  if (!(error instanceof Error)) {
    return fallback;
  }

  const msg = error.message;

  if (msg.includes("InvalidAccountId")) {
    return t?.("auth.errorNoAccount") ?? fallback;
  }
  if (msg.includes("Invalid credentials") || msg.includes("InvalidSecret")) {
    return t?.("validation.invalidCredentials") ?? fallback;
  }
  if (
    msg.includes("already exists") ||
    msg.includes("already in use") ||
    (msg.includes("Account ") && msg.includes("already exists"))
  ) {
    return t?.("auth.errorAccountExists") ?? fallback;
  }
  if (msg.includes("Could not send the reset email") || msg.includes("Could not send reset")) {
    return t?.("auth.errorResetEmail") ?? fallback;
  }
  if (
    msg.includes("No account found") ||
    msg.includes("No account found with this email")
  ) {
    return t?.("auth.errorNoAccount") ?? fallback;
  }
  if (msg.includes("AUTH_RESEND_KEY is not configured")) {
    return t?.("auth.errorResetEmail") ?? fallback;
  }
  if (msg.includes("TooManyFailedAttempts")) {
    return t?.("auth.errorTooManyAttempts") ?? fallback;
  }
  if (msg.includes("Missing environment variable")) {
    return t?.("auth.errorServerNotConfigured") ?? fallback;
  }
  if (
    msg.includes("Server Error") ||
    msg.includes("Exceeded") ||
    msg.includes("Free plan") ||
    msg.includes("disabled") ||
    msg.includes("Overloaded") ||
    msg.includes("503") ||
    msg.includes("Failed to fetch") ||
    msg.includes("NetworkError") ||
    msg.includes("loadingStuck") ||
    isTechnicalErrorMessage(msg)
  ) {
    return (
      t?.("auth.errorBackendUnavailable") ??
      "Login is temporarily unavailable. Please try again in a few minutes."
    );
  }

  return getSafeUserError(error, fallback);
}
