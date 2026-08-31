"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Users } from "lucide-react";
import { useUpdateWaliContact } from "@/data/profile/hooks";
import type { Profile } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { useTranslation } from "@/lib/i18n/context";
import { getSafeUserError } from "@/lib/safe-error";

const waliSchema = z.object({
  waliName: z.string().optional(),
  waliPhone: z.string().optional(),
});

type WaliForm = z.infer<typeof waliSchema>;

interface PremiumWaliCardProps {
  profile: Profile;
}

export function PremiumWaliCard({ profile }: PremiumWaliCardProps) {
  const { t } = useTranslation();
  const updateWali = useUpdateWaliContact();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<WaliForm>({
    resolver: zodResolver(waliSchema),
    values: {
      waliName: profile.waliName ?? "",
      waliPhone: profile.waliPhone ?? "",
    },
  });

  const onSubmit = async (data: WaliForm) => {
    try {
      await updateWali(data);
      toast.success(t("premium.waliSaved"));
    } catch (error) {
      toast.error(getSafeUserError(error, t("premium.waliSaveFailed"))
      );
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          {t("premium.waliTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t("premium.waliDesc")}
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            label={t("premium.waliName")}
            htmlFor="waliName"
            error={errors.waliName?.message}
          >
            <Input
              id="waliName"
              {...register("waliName")}
              placeholder={t("premium.waliNamePlaceholder")}
            />
          </FormField>
          <FormField
            label={t("premium.waliPhone")}
            htmlFor="waliPhone"
            error={errors.waliPhone?.message}
          >
            <Input
              id="waliPhone"
              {...register("waliPhone")}
              placeholder={t("premium.waliPhonePlaceholder")}
            />
          </FormField>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t("profilePage.saving") : t("premium.waliSave")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
