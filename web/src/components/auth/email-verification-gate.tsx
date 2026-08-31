"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useApiAuth } from "@/components/auth/api-auth-provider";

const ALLOWED_WHEN_UNVERIFIED = new Set([
  "/verify-email",
  "/change-password",
  "/login",
  "/logout",
  "/forgot-password",
  "/reset-password",
  "/register",
]);

/**
 * M3: when the API reports emailVerified=false, keep the user on the
 * verify-email screen until they confirm (or log out).
 * Server-side AuthGuard remains authoritative.
 * M4 forced-reset takes UI precedence when both apply.
 */
export function EmailVerificationGate({ children }: { children: ReactNode }) {
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
    // Absent flag (older API / migrated session): treat as verified to avoid loops.
    return true;
  })();

  useEffect(() => {
    if (isLoading || !isAuthenticated || mustReset || emailVerified) return;
    const allowed =
      ALLOWED_WHEN_UNVERIFIED.has(pathname) ||
      pathname.startsWith("/reset-password") ||
      pathname.startsWith("/verify-email") ||
      pathname.startsWith("/admin/invite");
    if (!allowed) {
      router.replace("/verify-email");
    }
  }, [isLoading, isAuthenticated, mustReset, emailVerified, pathname, router]);

  return <>{children}</>;
}
