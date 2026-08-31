"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail, Lock } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { GuestGate } from "@/components/auth/guest-gate";
import { RegisterStepIndicator } from "@/components/auth/register-step-indicator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, InputIconWrapper } from "@/components/ui/form-field";
import { createAccountSchema } from "@/lib/form-schemas";
import { useTranslation } from "@/lib/i18n/context";

export type AccountForm = z.infer<ReturnType<typeof createAccountSchema>>;

export function RegisterFormShell({
  onSubmit,
  loading,
}: {
  onSubmit: (data: AccountForm) => Promise<void>;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const accountSchema = useMemo(() => createAccountSchema(t), [t]);
  const accountForm = useForm<AccountForm>({
    resolver: zodResolver(accountSchema),
  });

  return (
    <GuestGate>
      <AuthShell
        title={t("auth.registerHeading")}
        description={t("auth.registerStep1Desc")}
        eyebrow={t("auth.registerEyebrow")}
        footer={
          <p className="text-center text-sm text-muted-foreground">
            {t("auth.alreadyHaveAccount")}{" "}
            <Link href="/login" className="font-semibold text-primary hover:underline">
              {t("auth.signInLink")}
            </Link>
          </p>
        }
      >
        <RegisterStepIndicator step={1} />

        <form onSubmit={accountForm.handleSubmit(onSubmit)} className="space-y-5">
          <FormField
            label={t("auth.email")}
            htmlFor="email"
            error={accountForm.formState.errors.email?.message}
            required
          >
            <InputIconWrapper icon={<Mail className="h-4 w-4" />}>
              <Input
                id="email"
                type="email"
                className="h-12 rounded-2xl pl-11 text-base"
                {...accountForm.register("email")}
                placeholder={t("auth.emailPlaceholder")}
                autoComplete="email"
              />
            </InputIconWrapper>
          </FormField>

          <FormField
            label={t("auth.password")}
            htmlFor="password"
            error={accountForm.formState.errors.password?.message}
            required
          >
            <InputIconWrapper icon={<Lock className="h-4 w-4" />}>
              <Input
                id="password"
                type="password"
                className="h-12 rounded-2xl pl-11 text-base"
                {...accountForm.register("password")}
                placeholder={t("auth.passwordNewPlaceholder")}
                autoComplete="new-password"
              />
            </InputIconWrapper>
          </FormField>

          <FormField
            label={t("auth.confirmPassword")}
            htmlFor="confirmPassword"
            error={accountForm.formState.errors.confirmPassword?.message}
            required
          >
            <InputIconWrapper icon={<Lock className="h-4 w-4" />}>
              <Input
                id="confirmPassword"
                type="password"
                className="h-12 rounded-2xl pl-11 text-base"
                {...accountForm.register("confirmPassword")}
                placeholder={t("auth.passwordConfirmPlaceholder")}
                autoComplete="new-password"
              />
            </InputIconWrapper>
          </FormField>

          <Button
            type="submit"
            className="mt-1 h-12 w-full rounded-2xl text-base font-semibold shadow-md shadow-primary/20"
            size="lg"
            disabled={loading}
          >
            {loading ? t("auth.creatingAccount") : t("auth.continue")}
          </Button>
        </form>
      </AuthShell>
    </GuestGate>
  );
}
