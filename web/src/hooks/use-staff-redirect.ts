"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUnifiedAuth } from "@/data/auth/hooks";
import { isStaffRole } from "@/lib/access";

/** Redirect admins/owners to the admin console; avoid member onboarding flashes. */
export function useStaffRedirect(adminPath = "/admin") {
  const router = useRouter();
  const { user } = useUnifiedAuth();
  const role =
    (user?.profile as { role?: string } | null | undefined)?.role ??
    (user as { role?: string } | null | undefined)?.role;
  const isStaff = isStaffRole(role);

  useEffect(() => {
    if (isStaff) {
      router.replace(adminPath);
    }
  }, [adminPath, isStaff, router]);

  return {
    user,
    isStaff,
    isLoading: user === undefined,
  };
}

/** Member-only gates (payment, questionnaire, approval) — never for staff. */
export function isMemberOnboardingProfile(
  profile: { role?: string; questionnaireComplete?: boolean } | null | undefined
): boolean {
  if (!profile || isStaffRole(profile.role)) return false;
  return !profile.questionnaireComplete;
}
