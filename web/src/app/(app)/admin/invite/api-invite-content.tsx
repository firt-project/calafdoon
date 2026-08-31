"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getAuthErrorMessage } from "@/lib/auth-errors";
import { useTranslation } from "@/lib/i18n/context";
import { isStaffRole } from "@/lib/access";
import { getSafeUserError } from "@/lib/safe-error";
import { useUnifiedAuth } from "@/data/auth/hooks";
import { getAdminAdapter } from "@/data/admin";
import { normalizeAuthEmail } from "@/lib/auth-email";
import {
  InviteForms,
  SignedInAccept,
  type AccountForm,
  type InviteView,
  type LoginForm,
} from "./invite-shared";

export default function ApiAdminInviteContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const router = useRouter();
  const { t } = useTranslation();
  const { isAuthenticated, isLoading: authLoading, user, login, register, refresh, signOut } =
    useUnifiedAuth();

  const [invite, setInvite] = useState<InviteView>(undefined);
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setInvite({ valid: false, reason: "not_found" });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = (await getAdminAdapter().staffInvites.getByToken(
          token
        )) as InviteView;
        if (!cancelled) setInvite(res);
      } catch {
        if (!cancelled) setInvite({ valid: false, reason: "not_found" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const finishAcceptance = useCallback(async () => {
    await getAdminAdapter().staffInvites.accept(token);
    toast.success(t("adminInvite.accepted"));
    router.push("/admin");
  }, [token, t, router]);

  const handleAcceptSignedIn = async () => {
    setLoading(true);
    try {
      await finishAcceptance();
    } catch (error) {
      toast.error(getSafeUserError(error, t("adminInvite.acceptFailed")));
    } finally {
      setLoading(false);
    }
  };

  const onSignUp = async (data: AccountForm) => {
    setLoading(true);
    try {
      await register!(normalizeAuthEmail(data.email), data.password);
      await refresh?.();
      await finishAcceptance();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (
        message.includes("already exists") ||
        message.includes("Unable to create account") ||
        message.includes("already in use")
      ) {
        toast.error(t("adminInvite.accountExists"));
        setMode("signin");
        return;
      }
      toast.error(getAuthErrorMessage(error, t("validation.registrationFailed"), t));
    } finally {
      setLoading(false);
    }
  };

  const onSignIn = async (data: LoginForm) => {
    setLoading(true);
    try {
      await login!(normalizeAuthEmail(data.email), data.password);
      await refresh?.();
      await finishAcceptance();
    } catch (error) {
      toast.error(getAuthErrorMessage(error, t("validation.invalidCredentials"), t));
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <AuthShell
        title={t("adminInvite.invalidTitle")}
        description={t("adminInvite.invalidDesc")}
      >
        <Button asChild className="w-full">
          <Link href="/login">{t("auth.signInLink")}</Link>
        </Button>
      </AuthShell>
    );
  }

  if (invite === undefined || authLoading) {
    return (
      <div className="auth-bg flex min-h-[calc(100dvh-var(--app-header))] items-center justify-center px-4">
        <Skeleton className="h-72 w-full max-w-md rounded-2xl" />
      </div>
    );
  }

  if (!invite.valid) {
    const reasonKey =
      invite.reason === "expired"
        ? "adminInvite.reasonExpired"
        : invite.reason === "revoked"
          ? "adminInvite.reasonRevoked"
          : invite.reason === "accepted"
            ? "adminInvite.reasonAccepted"
            : "adminInvite.reasonNotFound";

    return (
      <AuthShell title={t("adminInvite.invalidTitle")} description={t(reasonKey)}>
        <Button asChild className="w-full" variant="outline">
          <Link href="/login">{t("auth.signInLink")}</Link>
        </Button>
      </AuthShell>
    );
  }

  if (isAuthenticated && user !== undefined) {
    const role =
      (user as { role?: string })?.role ??
      (user?.profile as { role?: string } | null | undefined)?.role;
    return (
      <SignedInAccept
        inviteEmail={invite.email}
        userEmail={user?.email}
        alreadyStaff={isStaffRole(role)}
        loading={loading}
        onAccept={handleAcceptSignedIn}
        onSignOut={signOut}
      />
    );
  }

  return (
    <InviteForms
      invite={invite}
      mode={mode}
      setMode={setMode}
      loading={loading}
      onSignUp={onSignUp}
      onSignIn={onSignIn}
    />
  );
}
