"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Lock } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, InputIconWrapper } from "@/components/ui/form-field";
import { Skeleton } from "@/components/ui/skeleton";
import { getAuthErrorMessage } from "@/lib/auth-errors";
import { createTokenResetPasswordSchema } from "@/lib/form-schemas";
import { useTranslation } from "@/lib/i18n/context";
import { auth } from "@/data/auth";

type TokenResetForm = z.infer<ReturnType<typeof createTokenResetPasswordSchema>>;

/**
 * Nest link-token password reset landing page (`/reset-password?token=`).
 */
function ApiResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const { t } = useTranslation();
  const [resetting, setResetting] = useState(false);

  const schema = useMemo(() => createTokenResetPasswordSchema(t), [t]);
  const form = useForm<TokenResetForm>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const onSubmit = async (data: TokenResetForm) => {
    if (!token) {
      toast.error(t("auth.resetFailed"));
      return;
    }
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

  if (!token) {
    return (
      <AuthShell
        title={t("auth.resetTitle")}
        description={t("auth.resetDesc")}
        footer={
          <div className="text-center">
            <Link
              href="/forgot-password"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("auth.backToReset")}
            </Link>
          </div>
        }
      >
        <Button asChild className="w-full" variant="outline">
          <Link href="/forgot-password">{t("auth.sendResetCode")}</Link>
        </Button>
      </AuthShell>
    );
  }

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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <FormField
          label={t("auth.newPassword")}
          htmlFor="newPassword"
          error={form.formState.errors.newPassword?.message}
        >
          <InputIconWrapper icon={<Lock className="h-4 w-4" />}>
            <Input
              id="newPassword"
              type="password"
              className="h-13 rounded-2xl pl-11 text-[15px]"
              {...form.register("newPassword")}
              placeholder={t("auth.passwordNewPlaceholder")}
              autoComplete="new-password"
            />
          </InputIconWrapper>
        </FormField>

        <FormField
          label={t("auth.confirmPassword")}
          htmlFor="confirmPassword"
          error={form.formState.errors.confirmPassword?.message}
        >
          <InputIconWrapper icon={<Lock className="h-4 w-4" />}>
            <Input
              id="confirmPassword"
              type="password"
              className="h-13 rounded-2xl pl-11 text-[15px]"
              {...form.register("confirmPassword")}
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

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="auth-bg flex min-h-[calc(100dvh-var(--app-header))] items-center justify-center px-4">
          <Skeleton className="h-72 w-full max-w-md rounded-2xl" />
        </div>
      }
    >
      <ApiResetPasswordContent />
    </Suspense>
  );
}
