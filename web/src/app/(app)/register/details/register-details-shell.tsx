"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterStepIndicator } from "@/components/auth/register-step-indicator";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  GenderSelectCards,
  type GenderValue,
} from "@/components/questionnaire/gender-select-cards";
import { useTranslation } from "@/lib/i18n/context";

export type { GenderValue };

export function RegisterDetailsShell({
  isEditGender,
  gender,
  setGender,
  loading,
  onContinue,
  onBack,
}: {
  isEditGender: boolean;
  gender: GenderValue | "";
  setGender: (g: GenderValue) => void;
  loading: boolean;
  onContinue: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();

  return (
    <AuthShell
      title={isEditGender ? t("auth.changeGenderTitle") : t("auth.registerStep2Title")}
      description={
        isEditGender ? t("auth.changeGenderDesc") : t("auth.registerStep2Desc")
      }
      eyebrow={isEditGender ? undefined : t("auth.registerEyebrow")}
      footer={
        <p className="text-center text-sm text-muted-foreground">
          {t("auth.wrongAccount")}{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            {t("auth.signInLink")}
          </Link>
        </p>
      }
    >
      {!isEditGender && <RegisterStepIndicator step={2} />}

      <div className="space-y-6">
        {isEditGender && (
          <Button
            type="button"
            variant="ghost"
            className="px-0 -mt-2 text-muted-foreground hover:text-foreground"
            onClick={onBack}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            {t("common.back")}
          </Button>
        )}

        <GenderSelectCards
          value={gender}
          maleLabel={t("auth.male")}
          femaleLabel={t("auth.female")}
          disabled={loading}
          onChange={setGender}
        />

        <p className="text-sm text-center text-muted-foreground">
          {t("auth.genderChangeHint")}
        </p>

        <Button
          type="button"
          className="h-13 w-full rounded-2xl text-base font-semibold shadow-md shadow-primary/20"
          size="lg"
          disabled={loading || !gender}
          onClick={() => void onContinue()}
        >
          {loading
            ? t("auth.savingDetails")
            : isEditGender
              ? t("auth.saveGender")
              : t("auth.continueToQuestionnaire")}
        </Button>
      </div>
    </AuthShell>
  );
}

export function LoadingDetails() {
  const { t } = useTranslation();
  return (
    <div className="auth-bg flex min-h-[calc(100dvh-var(--app-header))] items-center justify-center px-4">
      <div className="w-full max-w-md space-y-4 text-center">
        <Skeleton className="h-72 w-full rounded-2xl" aria-hidden />
        <p className="text-sm text-muted-foreground" role="status">
          {t("common.loadingData")}
        </p>
      </div>
    </div>
  );
}
