"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Mail, Lock, ArrowLeft } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, InputIconWrapper } from "@/components/ui/form-field";
import { getAuthErrorMessage } from "@/lib/auth-errors";
import { normalizeAuthEmail } from "@/lib/auth-email";
import {
  createForgotEmailSchema,
  createTokenResetPasswordSchema,
} from "@/lib/form-schemas";
import { useTranslation } from "@/lib/i18n/context";
import { auth } from "@/data/auth";

type EmailForm = z.infer<ReturnType<typeof createForgotEmailSchema>>;
type TokenResetForm = z.infer<ReturnType<typeof createTokenResetPasswordSchema>>;

function ApiForgotPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const { t } = useTranslation();

  const emailSchema = useMemo(() => createForgotEmailSchema(t), [t]);
  const tokenResetSchema = useMemo(() => createTokenResetPasswordSchema(t), [t]);

  const [sending, setSending] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [sent, setSent] = useState(false);

  const emailForm = useForm<EmailForm>({
    resolver: zodResolver(emailSchema),
  });

  const resetForm = useForm<TokenResetForm>({
    resolver: zodResolver(tokenResetSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const onRequestReset = async (data: EmailForm) => {
    setSending(true);
    try {
      const result = await auth.forgotPassword(normalizeAuthEmail(data.email));
      // M2: never branch on account existence — HTTP 200 always means generic success.
      setSent(true);
      toast.success(result.message || t("auth.resetLinkSent"));
    } catch (error) {
      toast.error(getAuthErrorMessage(error, t("auth.resetSendFailed"), t));
    } finally {
      setSending(false);
    }
  };

  const onResetPassword = async (data: TokenResetForm) => {
    setResetting(true);
    try {
      await auth.resetPassword(token, data.newPassword);
      toast.success(t("auth.resetSuccess"));
      router.replace("/login");
    } catch (error) {
      toast.error(getAuthErrorMessage(error, t("auth.resetFailed"), t));
    } finally {
      setResetting(false);
    }
  };

  if (token) {
    return (
      <AuthShell
        title={t("auth.resetCodeTitle")}
        description={t("auth.resetDesc")}
        footer={
          <div className="text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("auth.backToSignIn")}
            </Link>
          </div>
        }
      >
        <form
          onSubmit={resetForm.handleSubmit(onResetPassword)}
          className="space-y-5"
        >
          <FormField
            label={t("auth.newPassword")}
            htmlFor="newPassword"
            error={resetForm.formState.errors.newPassword?.message}
          >
            <InputIconWrapper icon={<Lock className="h-4 w-4" />}>
              <Input
                id="newPassword"
                type="password"
                className="h-13 rounded-2xl pl-11 text-[15px]"
                {...resetForm.register("newPassword")}
                placeholder={t("auth.passwordNewPlaceholder")}
                autoComplete="new-password"
              />
            </InputIconWrapper>
          </FormField>

          <FormField
            label={t("auth.confirmPassword")}
            htmlFor="confirmPassword"
            error={resetForm.formState.errors.confirmPassword?.message}
          >
            <InputIconWrapper icon={<Lock className="h-4 w-4" />}>
              <Input
                id="confirmPassword"
                type="password"
                className="h-13 rounded-2xl pl-11 text-[15px]"
                {...resetForm.register("confirmPassword")}
                placeholder={t("auth.passwordConfirmPlaceholder")}
                autoComplete="new-password"
              />
            </InputIconWrapper>
          </FormField>

          <Button
            type="submit"
            className="h-13 w-full rounded-2xl text-base font-semibold shadow-md shadow-primary/20"
            size="lg"
            disabled={resetting}
          >
            {resetting ? t("auth.resetting") : t("auth.setNewPassword")}
          </Button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t("auth.resetTitle")}
      description={sent ? t("auth.resetLinkSent") : t("auth.resetDesc")}
      footer={
        <div className="text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("auth.backToSignIn")}
          </Link>
        </div>
      }
    >
      {sent ? (
        <p className="text-sm text-muted-foreground text-center">
          {t("auth.resetLinkSent")}
        </p>
      ) : (
        <form onSubmit={emailForm.handleSubmit(onRequestReset)} className="space-y-5">
          <FormField
            label={t("auth.email")}
            htmlFor="email"
            error={emailForm.formState.errors.email?.message}
          >
            <InputIconWrapper icon={<Mail className="h-4 w-4" />}>
              <Input
                id="email"
                type="email"
                className="h-13 rounded-2xl pl-11 text-[15px]"
                {...emailForm.register("email")}
                placeholder={t("auth.emailPlaceholder")}
                autoComplete="email"
              />
            </InputIconWrapper>
          </FormField>

          <Button
            type="submit"
            className="h-13 w-full rounded-2xl text-base font-semibold shadow-md shadow-primary/20"
            size="lg"
            disabled={sending}
          >
            {sending ? t("auth.sendingReset") : t("auth.sendResetCode")}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

export default function ApiForgotPasswordForm() {
  return (
    <Suspense
      fallback={
        <div className="auth-bg flex min-h-[calc(100dvh-var(--app-header))] items-center justify-center px-4">
          <div className="h-72 w-full max-w-md animate-pulse rounded-2xl bg-muted" />
        </div>
      }
    >
      <ApiForgotPasswordInner />
    </Suspense>
  );
}
