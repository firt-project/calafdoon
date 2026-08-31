"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getAuthErrorMessage } from "@/lib/auth-errors";
import { normalizeAuthEmail } from "@/lib/auth-email";
import {
  getPostLoginRoute,
  isLoginSessionConfirmed,
} from "@/lib/post-login-route";
import { useTranslation } from "@/lib/i18n/context";
import { useUnifiedAuth } from "@/data/auth/hooks";
import { auth } from "@/data/auth";
import { useApiAuth } from "@/components/auth/api-auth-provider";
import { track } from "@/data/telemetry";
import { LoginFormShell, type LoginForm } from "./login-form-shell";
import { AuthShell } from "@/components/auth/auth-shell";
import { GuestGate } from "@/components/auth/guest-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { APP_NAME } from "@/lib/constants";

/** Non-sensitive: whether the readable CSRF cookie is present (session is HttpOnly). */
function csrfCookiePresent(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((c) => c.trim().startsWith("hel_csrf="));
}

export default function ApiLoginForm() {
  const { login, refresh } = useUnifiedAuth();
  const { verifyMfaLogin, accessState } = useApiAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const { t } = useTranslation();

  const finishLogin = async () => {
    await refresh?.();
    const boot = await auth.bootstrapMe();
    // Login JSON / password success ≠ authenticated: require cookie-backed /auth/me.
    if (!isLoginSessionConfirmed(boot.user)) {
      track("login_session_unconfirmed", {
        stage: "finish_login",
        csrfReadablePresent: csrfCookiePresent(),
      });
      toast.error(t("auth.sessionNotEstablished"));
      return;
    }
    toast.success(t("auth.welcomeBackToast"));
    const dest = getPostLoginRoute(
      boot.user,
      boot.accessState ?? accessState
    );
    router.replace(dest);
  };

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    try {
      const result = await Promise.race([
        login!(normalizeAuthEmail(data.email), data.password),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(t("common.loadingStuck"))), 20_000)
        ),
      ]);
      if (result && "mfaRequired" in result && result.mfaRequired) {
        setMfaToken(result.mfaToken);
        setMfaCode("");
        return;
      }
      await finishLogin();
    } catch (error) {
      toast.error(getAuthErrorMessage(error, t("validation.invalidCredentials"), t));
    } finally {
      setLoading(false);
    }
  };

  const onVerifyMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaToken) return;
    setLoading(true);
    try {
      await verifyMfaLogin(mfaToken, mfaCode.trim());
      setMfaToken(null);
      setMfaCode("");
      await finishLogin();
    } catch (error) {
      toast.error(getAuthErrorMessage(error, t("auth.mfaInvalid"), t));
    } finally {
      setLoading(false);
    }
  };

  if (mfaToken) {
    return (
      <GuestGate>
        <AuthShell
          title={t("auth.mfaTitle")}
          description={t("auth.mfaDesc")}
          eyebrow={t("auth.signInEyebrow")}
          footer={
            <button
              type="button"
              className="text-sm font-semibold text-primary hover:underline"
              onClick={() => {
                setMfaToken(null);
                setMfaCode("");
              }}
            >
              {t("auth.mfaBack")}
            </button>
          }
        >
          <form onSubmit={onVerifyMfa} className="space-y-5">
            <FormField
              label={t("auth.mfaCode")}
              htmlFor="mfaCode"
              hint={t("auth.mfaRecoveryHint")}
            >
              <Input
                id="mfaCode"
                autoComplete="one-time-code"
                spellCheck={false}
                className="h-12 rounded-2xl text-center text-lg tracking-widest"
                value={mfaCode}
                onChange={(ev) => setMfaCode(ev.target.value)}
                placeholder={t("auth.mfaCodePlaceholder")}
                maxLength={32}
                required
              />
            </FormField>
            <Button
              type="submit"
              className="h-12 w-full rounded-2xl"
              disabled={loading || mfaCode.trim().length < 6}
            >
              {loading ? t("auth.mfaVerifying") : t("auth.mfaVerify")}
            </Button>
            <p className="sr-only">{APP_NAME}</p>
          </form>
        </AuthShell>
      </GuestGate>
    );
  }

  return <LoginFormShell onSubmit={onSubmit} loading={loading} />;
}
