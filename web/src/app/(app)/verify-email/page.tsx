"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useApiAuth } from "@/components/auth/api-auth-provider";
import { Button } from "@/components/ui/button";
import { MemberDataLoading } from "@/components/auth/member-data-loading";
import { apiClient } from "@/data/api-client";
import { auth } from "@/data/auth";
import { useTranslation } from "@/lib/i18n/context";
import { getAuthenticatedHomeRoute } from "@/lib/routes";

function nextRouteAfterVerify(user: {
  emailVerified?: boolean;
  mfaEnrollmentRequired?: boolean;
  mustResetPassword?: boolean;
  role?: string;
  hasPaid?: boolean;
  profile?: Record<string, unknown> | null;
} | null): string {
  if (!user) return "/login";
  if (
    user.mustResetPassword ||
    (user.profile as { mustResetPassword?: boolean } | null | undefined)
      ?.mustResetPassword
  ) {
    return "/change-password";
  }
  if (
    user.mfaEnrollmentRequired ||
    (user.profile as { mfaEnrollmentRequired?: boolean } | null | undefined)
      ?.mfaEnrollmentRequired
  ) {
    return "/enroll-mfa";
  }
  const profileForRoute =
    (user.profile as Parameters<typeof getAuthenticatedHomeRoute>[0]) ??
    ({
      role: user.role,
      hasPaid: user.hasPaid,
      questionnaireComplete: true,
      registrationComplete: true,
    } as Parameters<typeof getAuthenticatedHomeRoute>[0]);
  return getAuthenticatedHomeRoute(profileForRoute);
}

function VerifyEmailInner() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const { user, isLoading, isAuthenticated, logout, refresh } = useApiAuth();
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [done, setDone] = useState(false);

  const emailVerified =
    (user as { emailVerified?: boolean } | null)?.emailVerified === true;

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated && !token) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, token, router]);

  useEffect(() => {
    if (isLoading || emailVerified) return;
    if (!token || done) return;

    let cancelled = false;
    setVerifying(true);
    (async () => {
      try {
        await apiClient.post<{ ok: boolean }>("/auth/verify-email", { token });
        if (cancelled) return;
        setDone(true);
        toast.success(t("auth.verifyEmailSuccess"));
        await refresh();
        const current = await auth.getCurrentUser();
        if (cancelled) return;
        router.replace(nextRouteAfterVerify(current as never));
      } catch {
        if (cancelled) return;
        toast.error(t("auth.verifyEmailFailed"));
      } finally {
        if (!cancelled) setVerifying(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally one-shot per token; do not re-run on verifying toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, emailVerified, token, done]);

  useEffect(() => {
    if (!isLoading && emailVerified && !token) {
      router.replace(nextRouteAfterVerify(user as never));
    }
  }, [isLoading, emailVerified, token, router, user]);

  if (isLoading || verifying) {
    return <MemberDataLoading />;
  }

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("auth.verifyEmailTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("auth.verifyEmailBody")}
        </p>
        {user?.email ? (
          <p className="text-sm font-medium">{user.email}</p>
        ) : null}
      </div>

      <Button
        type="button"
        disabled={resending || emailVerified}
        onClick={async () => {
          setResending(true);
          try {
            const res = await apiClient.post<{
              alreadyVerified?: boolean;
              sent?: boolean;
            }>("/auth/resend-verification", {});
            if (res?.alreadyVerified) {
              toast.success(t("auth.verifyEmailAlready"));
              await refresh();
              const current = await auth.getCurrentUser();
              router.replace(nextRouteAfterVerify(current as never));
              return;
            }
            toast.success(t("auth.verifyEmailResent"));
          } catch {
            toast.error(t("auth.verifyEmailResendFailed"));
          } finally {
            setResending(false);
          }
        }}
      >
        {resending
          ? t("common.loading")
          : t("auth.resendVerification")}
      </Button>

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

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<MemberDataLoading />}>
      <VerifyEmailInner />
    </Suspense>
  );
}
