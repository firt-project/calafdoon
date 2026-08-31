"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Lock, Mail, Shield } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, InputIconWrapper } from "@/components/ui/form-field";
import { APP_NAME } from "@/lib/constants";
import { createAccountSchema, createLoginSchema } from "@/lib/form-schemas";
import { useTranslation } from "@/lib/i18n/context";

export type AccountForm = z.infer<ReturnType<typeof createAccountSchema>>;
export type LoginForm = z.infer<ReturnType<typeof createLoginSchema>>;

export type InviteView =
  | { valid: true; email: string; role?: string }
  | { valid: false; reason?: string }
  | undefined;

export function InviteForms({
  invite,
  mode,
  setMode,
  loading,
  onSignUp,
  onSignIn,
}: {
  invite: { valid: true; email: string };
  mode: "signup" | "signin";
  setMode: (m: "signup" | "signin") => void;
  loading: boolean;
  onSignUp: (data: AccountForm) => Promise<void>;
  onSignIn: (data: LoginForm) => Promise<void>;
}) {
  const { t } = useTranslation();
  const accountSchema = useMemo(() => createAccountSchema(t), [t]);
  const loginSchema = useMemo(() => createLoginSchema(t), [t]);

  const accountForm = useForm<AccountForm>({
    resolver: zodResolver(accountSchema),
    values: {
      email: invite.email,
      password: "",
      confirmPassword: "",
    },
  });

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    values: {
      email: invite.email,
      password: "",
    },
  });

  return (
    <AuthShell
      title={t("adminInvite.joinTitle", { name: APP_NAME })}
      description={t("adminInvite.joinDesc", { email: invite.email })}
      footer={
        <p className="text-center text-sm text-muted-foreground">
          {t("adminInvite.notForYou")}{" "}
          <Link href="/" className="font-medium text-primary hover:underline">
            {t("adminInvite.backHome")}
          </Link>
        </p>
      }
    >
      <div className="mb-5 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm">
        <p className="font-medium text-primary">{t("adminInvite.roleAdmin")}</p>
        <p className="mt-1 text-muted-foreground">{invite.email}</p>
      </div>

      <div className="mb-5 flex rounded-xl bg-muted/60 p-1">
        <Button
          type="button"
          variant={mode === "signup" ? "default" : "ghost"}
          className="flex-1 rounded-lg"
          onClick={() => setMode("signup")}
        >
          {t("adminInvite.newAccount")}
        </Button>
        <Button
          type="button"
          variant={mode === "signin" ? "default" : "ghost"}
          className="flex-1 rounded-lg"
          onClick={() => setMode("signin")}
        >
          {t("adminInvite.existingAccount")}
        </Button>
      </div>

      {mode === "signup" ? (
        <form onSubmit={accountForm.handleSubmit(onSignUp)} className="space-y-5">
          <FormField
            label={t("auth.email")}
            htmlFor="invite-email"
            error={accountForm.formState.errors.email?.message}
            required
          >
            <InputIconWrapper icon={<Mail className="h-4 w-4" />}>
              <Input
                id="invite-email"
                type="email"
                className="pl-11"
                readOnly
                {...accountForm.register("email")}
              />
            </InputIconWrapper>
          </FormField>

          <FormField
            label={t("auth.password")}
            htmlFor="invite-password"
            error={accountForm.formState.errors.password?.message}
            required
          >
            <InputIconWrapper icon={<Lock className="h-4 w-4" />}>
              <Input
                id="invite-password"
                type="password"
                className="pl-11"
                autoComplete="new-password"
                {...accountForm.register("password")}
                placeholder={t("auth.passwordNewPlaceholder")}
              />
            </InputIconWrapper>
          </FormField>

          <FormField
            label={t("auth.confirmPassword")}
            htmlFor="invite-confirm-password"
            error={accountForm.formState.errors.confirmPassword?.message}
            required
          >
            <InputIconWrapper icon={<Lock className="h-4 w-4" />}>
              <Input
                id="invite-confirm-password"
                type="password"
                className="pl-11"
                autoComplete="new-password"
                {...accountForm.register("confirmPassword")}
                placeholder={t("auth.passwordConfirmPlaceholder")}
              />
            </InputIconWrapper>
          </FormField>

          <Button type="submit" className="w-full font-semibold" size="lg" disabled={loading}>
            {loading ? t("adminInvite.settingUp") : t("adminInvite.createAndAccept")}
          </Button>
        </form>
      ) : (
        <form onSubmit={loginForm.handleSubmit(onSignIn)} className="space-y-5">
          <FormField
            label={t("auth.email")}
            htmlFor="invite-login-email"
            error={loginForm.formState.errors.email?.message}
            required
          >
            <InputIconWrapper icon={<Mail className="h-4 w-4" />}>
              <Input
                id="invite-login-email"
                type="email"
                className="pl-11"
                readOnly
                {...loginForm.register("email")}
              />
            </InputIconWrapper>
          </FormField>

          <FormField
            label={t("auth.password")}
            htmlFor="invite-login-password"
            error={loginForm.formState.errors.password?.message}
            required
          >
            <InputIconWrapper icon={<Lock className="h-4 w-4" />}>
              <Input
                id="invite-login-password"
                type="password"
                className="pl-11"
                autoComplete="current-password"
                {...loginForm.register("password")}
                placeholder={t("auth.passwordPlaceholder")}
              />
            </InputIconWrapper>
          </FormField>

          <Button type="submit" className="w-full font-semibold" size="lg" disabled={loading}>
            {loading ? t("adminInvite.accepting") : t("adminInvite.signInAndAccept")}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

export function SignedInAccept({
  inviteEmail,
  userEmail,
  alreadyStaff,
  loading,
  onAccept,
  onSignOut,
}: {
  inviteEmail: string;
  userEmail: string | null | undefined;
  alreadyStaff: boolean;
  loading: boolean;
  onAccept: () => void;
  onSignOut: () => void;
}) {
  const { t } = useTranslation();
  const emailMatches =
    (userEmail ?? "").toLowerCase() === inviteEmail.toLowerCase();

  return (
    <AuthShell
      title={t("adminInvite.acceptTitle")}
      description={t("adminInvite.acceptDesc", { email: inviteEmail })}
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium text-primary">
            <Shield className="h-4 w-4" />
            {t("adminInvite.roleAdmin")}
          </p>
          <p className="mt-1 text-muted-foreground">{inviteEmail}</p>
        </div>

        {!emailMatches && (
          <div className="space-y-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p>{t("adminInvite.wrongAccount", { email: inviteEmail })}</p>
            <p className="text-muted-foreground">
              {t("adminInvite.signedInAs", { email: userEmail ?? "—" })}
            </p>
            <Button variant="outline" className="w-full" onClick={() => void onSignOut()}>
              {t("adminInvite.signOut")}
            </Button>
          </div>
        )}

        {emailMatches && (
          <Button
            className="w-full"
            size="lg"
            disabled={loading}
            onClick={() => void onAccept()}
          >
            {loading
              ? t("adminInvite.accepting")
              : alreadyStaff
                ? t("adminInvite.confirmAccess")
                : t("adminInvite.acceptButton")}
          </Button>
        )}
      </div>
    </AuthShell>
  );
}
