"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { useChangePassword } from "@/data/auth/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, InputIconWrapper } from "@/components/ui/form-field";
import { createChangePasswordSchema } from "@/lib/form-schemas";
import { useTranslation } from "@/lib/i18n/context";
import { getSafeUserError } from "@/lib/safe-error";

type ChangePasswordForm = z.infer<ReturnType<typeof createChangePasswordSchema>>;

export function ChangePasswordCard({
  embedded = false,
  onSuccess,
}: {
  embedded?: boolean;
  /** When set, caller handles success UX (e.g. forced-reset → login). */
  onSuccess?: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const schema = useMemo(() => createChangePasswordSchema(t), [t]);
  const changePassword = useChangePassword();
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordForm>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: ChangePasswordForm) => {
    setSaving(true);
    try {
      await changePassword({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      reset();
      if (onSuccess) {
        await onSuccess();
      } else {
        toast.success(t("profilePage.passwordChanged"));
      }
    } catch (error) {
      const message =
        getSafeUserError(error, t("profilePage.passwordChangeFailed"));
      toast.error(
        message.includes("incorrect") || message.includes("InvalidSecret")
          ? t("profilePage.passwordChangeFailed")
          : message
      );
    } finally {
      setSaving(false);
    }
  };

  const form = (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            label={t("profilePage.currentPassword")}
            htmlFor="currentPassword"
            error={errors.currentPassword?.message}
          >
            <InputIconWrapper icon={<Lock className="h-4 w-4" />}>
              <Input
                id="currentPassword"
                type="password"
                className="pl-11"
                autoComplete="current-password"
                {...register("currentPassword")}
              />
            </InputIconWrapper>
          </FormField>

          <FormField
            label={t("profilePage.newPassword")}
            htmlFor="newPassword"
            error={errors.newPassword?.message}
          >
            <InputIconWrapper icon={<Lock className="h-4 w-4" />}>
              <Input
                id="newPassword"
                type="password"
                className="pl-11"
                autoComplete="new-password"
                placeholder={t("auth.passwordNewPlaceholder")}
                {...register("newPassword")}
              />
            </InputIconWrapper>
          </FormField>

          <FormField
            label={t("profilePage.confirmNewPassword")}
            htmlFor="confirmPassword"
            error={errors.confirmPassword?.message}
          >
            <InputIconWrapper icon={<Lock className="h-4 w-4" />}>
              <Input
                id="confirmPassword"
                type="password"
                className="pl-11"
                autoComplete="new-password"
                {...register("confirmPassword")}
              />
            </InputIconWrapper>
          </FormField>

          <Button type="submit" disabled={saving} size={embedded ? "sm" : "default"}>
            {saving ? t("profilePage.updatingPassword") : t("profilePage.updatePassword")}
          </Button>
        </form>
  );

  if (embedded) return form;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("profilePage.changePassword")}</CardTitle>
      </CardHeader>
      <CardContent>{form}</CardContent>
    </Card>
  );
}
