"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useApiAuth } from "@/components/auth/api-auth-provider";

const ALLOWED_WHEN_RESET_REQUIRED = new Set([
  "/change-password",
  "/verify-email",
  "/login",
  "/logout",
  "/forgot-password",
  "/reset-password",
]);

/**
 * M4: when the API reports mustResetPassword, keep the user on the
 * forced change-password screen until they complete it (or log out).
 * Server-side AuthGuard remains authoritative.
 */
export function ForcedPasswordResetGate({ children }: { children: ReactNode }) {
  const { user, isLoading, isAuthenticated } = useApiAuth();
  const router = useRouter();
  const pathname = usePathname() || "/";

  const mustReset = Boolean(
    user &&
      ((user as { mustResetPassword?: boolean }).mustResetPassword === true ||
        (user.profile as { mustResetPassword?: boolean } | null | undefined)
          ?.mustResetPassword === true)
  );

  useEffect(() => {
    if (isLoading || !isAuthenticated || !mustReset) return;
    const allowed =
      ALLOWED_WHEN_RESET_REQUIRED.has(pathname) ||
      pathname.startsWith("/reset-password");
    if (!allowed) {
      router.replace("/change-password");
    }
  }, [isLoading, isAuthenticated, mustReset, pathname, router]);

  return <>{children}</>;
}
