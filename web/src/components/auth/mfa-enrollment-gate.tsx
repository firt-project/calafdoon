"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useApiAuth } from "@/components/auth/api-auth-provider";

const ALLOWED_WHEN_MFA_ENROLLMENT_REQUIRED = new Set([
  "/enroll-mfa",
  "/change-password",
  "/verify-email",
  "/login",
  "/logout",
  "/forgot-password",
  "/reset-password",
]);

/**
 * L4: when the API reports mfaEnrollmentRequired, keep staff on the
 * MFA enrollment screen until they complete it (or log out).
 * M4/M3 UI gates take precedence when those flags apply.
 * Server-side AuthGuard remains authoritative.
 */
export function MfaEnrollmentGate({ children }: { children: ReactNode }) {
  const { user, isLoading, isAuthenticated } = useApiAuth();
  const router = useRouter();
  const pathname = usePathname() || "/";

  const mustReset = Boolean(
    user &&
      ((user as { mustResetPassword?: boolean }).mustResetPassword === true ||
        (user.profile as { mustResetPassword?: boolean } | null | undefined)
          ?.mustResetPassword === true)
  );

  const emailVerified = (() => {
    if (!user) return true;
    if ((user as { emailVerified?: boolean }).emailVerified === false) {
      return false;
    }
    if ((user as { emailVerified?: boolean }).emailVerified === true) {
      return true;
    }
    return true;
  })();

  const mfaEnrollmentRequired = Boolean(
    user &&
      ((user as { mfaEnrollmentRequired?: boolean }).mfaEnrollmentRequired ===
        true ||
        (
          user.profile as { mfaEnrollmentRequired?: boolean } | null | undefined
        )?.mfaEnrollmentRequired === true)
  );

  useEffect(() => {
    if (
      isLoading ||
      !isAuthenticated ||
      mustReset ||
      !emailVerified ||
      !mfaEnrollmentRequired
    ) {
      return;
    }
    const allowed =
      ALLOWED_WHEN_MFA_ENROLLMENT_REQUIRED.has(pathname) ||
      pathname.startsWith("/reset-password") ||
      pathname.startsWith("/verify-email") ||
      pathname.startsWith("/enroll-mfa");
    if (!allowed) {
      router.replace("/enroll-mfa");
    }
  }, [
    isLoading,
    isAuthenticated,
    mustReset,
    emailVerified,
    mfaEnrollmentRequired,
    pathname,
    router,
  ]);

  return <>{children}</>;
}
