"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useApiAuth } from "@/components/auth/api-auth-provider";
import { ChangePasswordCard } from "@/components/profile/change-password-card";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/context";
import { MemberDataLoading } from "@/components/auth/member-data-loading";

/**
 * Forced password-change surface for accounts with mustResetPassword.
 * Only uses allowlisted auth APIs (me / change-password / logout).
 */
export default function ChangePasswordPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, isLoading, isAuthenticated, logout, refresh } = useApiAuth();
  const mustReset = Boolean(
    (user as { mustResetPassword?: boolean } | null)?.mustResetPassword
  );

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (user && !mustReset) {
      router.replace("/dashboard");
    }
  }, [isLoading, isAuthenticated, user, mustReset, router]);

  if (isLoading || !isAuthenticated) {
    return <MemberDataLoading />;
  }

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("profilePage.changePassword")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {mustReset
            ? t("auth.passwordNewPlaceholder")
            : t("profilePage.changePassword")}
        </p>
      </div>

      <ChangePasswordCard
        onSuccess={async () => {
          toast.success(t("profilePage.passwordChanged"));
          await logout();
          await refresh();
          router.replace("/login");
        }}
      />

      <Button
        type="button"
        variant="ghost"
        onClick={async () => {
          await logout();
          router.replace("/login");
        }}
      >
        {t("app.logOut")}
      </Button>
    </main>
  );
}
