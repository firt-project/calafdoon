"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail, Lock } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { GuestGate } from "@/components/auth/guest-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, InputIconWrapper } from "@/components/ui/form-field";
import { APP_NAME } from "@/lib/constants";
import { createLoginSchema } from "@/lib/form-schemas";
import { useTranslation } from "@/lib/i18n/context";

export type LoginForm = z.infer<ReturnType<typeof createLoginSchema>>;

export function LoginFormShell({
  onSubmit,
  loading,
}: {
  onSubmit: (data: LoginForm) => Promise<void>;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const loginSchema = useMemo(() => createLoginSchema(t), [t]);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  return (
    <GuestGate>
      <AuthShell
        title={t("auth.welcomeBack")}
        description={t("auth.signInDesc", { name: APP_NAME })}
        eyebrow={t("auth.signInEyebrow")}
        footer={
          <p className="text-center text-sm text-muted-foreground">
            {t("auth.noAccount")}{" "}
            <Link href="/register" className="font-semibold text-primary hover:underline">
              {t("auth.createAccount")}
            </Link>
          </p>
        }
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <FormField label={t("auth.email")} htmlFor="email" error={errors.email?.message}>
            <InputIconWrapper icon={<Mail className="h-4 w-4" />}>
              <Input
                id="email"
                type="email"
                className="h-12 rounded-2xl pl-11 text-base"
                {...register("email")}
                placeholder={t("auth.emailPlaceholder")}
                autoComplete="email"
              />
            </InputIconWrapper>
          </FormField>

          <FormField
            label={t("auth.password")}
            htmlFor="password"
            error={errors.password?.message}
            labelAction={
              <Link
                href="/forgot-password"
                className="text-sm font-semibold text-primary hover:underline"
              >
                {t("auth.forgotPassword")}
              </Link>
            }
          >
            <InputIconWrapper icon={<Lock className="h-4 w-4" />}>
              <Input
                id="password"
                type="password"
                className="h-12 rounded-2xl pl-11 text-base"
                {...register("password")}
                placeholder={t("auth.passwordPlaceholder")}
                autoComplete="current-password"
              />
            </InputIconWrapper>
          </FormField>

          <Button
            type="submit"
            className="mt-1 h-12 w-full rounded-2xl text-base font-semibold shadow-md shadow-primary/20"
            size="lg"
            disabled={loading}
          >
            {loading ? t("auth.signingIn") : t("auth.signIn")}
          </Button>
        </form>
      </AuthShell>
    </GuestGate>
  );
}
