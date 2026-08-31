"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { MfaSettingsCard } from "@/components/profile/mfa-settings-card";
import { useApiAuth } from "@/components/auth/api-auth-provider";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/context";
import { getAuthenticatedHomeRoute } from "@/lib/routes";

/**
 * Restricted staff surface while REQUIRE_STAFF_MFA is on and MFA is not enabled.
 * Avoids redirect loops by being the sole destination of MfaEnrollmentGate.
 */
export default function EnrollMfaPage() {
  const { user, isLoading, isAuthenticated, logout, refresh } = useApiAuth();
  const router = useRouter();
  const { t } = useTranslation();

  const mfaEnrollmentRequired = Boolean(
    user &&
      ((user as { mfaEnrollmentRequired?: boolean }).mfaEnrollmentRequired ===
        true ||
        (
          user.profile as { mfaEnrollmentRequired?: boolean } | null | undefined
        )?.mfaEnrollmentRequired === true)
  );

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (!mfaEnrollmentRequired) {
      const profileForRoute =
        (user?.profile as Parameters<typeof getAuthenticatedHomeRoute>[0]) ??
        ({
          role: (user as { role?: string } | null)?.role,
          hasPaid: (user as { hasPaid?: boolean } | null)?.hasPaid,
          questionnaireComplete: true,
          registrationComplete: true,
        } as Parameters<typeof getAuthenticatedHomeRoute>[0]);
      router.replace(getAuthenticatedHomeRoute(profileForRoute));
    }
  }, [isLoading, isAuthenticated, mfaEnrollmentRequired, user, router]);

  return (
    <AuthShell
      title={t("profilePage.mfaTitle")}
      description={t("auth.mfaEnrollRequiredDesc")}
      eyebrow={t("auth.signInEyebrow")}
      footer={
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={async () => {
            await logout();
            router.replace("/login");
          }}
        >
          {t("auth.mfaBack")}
        </Button>
      }
    >
      <MfaSettingsCard
        embedded
        onEnabled={async () => {
          await refresh();
          router.replace("/admin");
        }}
      />
    </AuthShell>
  );
}
