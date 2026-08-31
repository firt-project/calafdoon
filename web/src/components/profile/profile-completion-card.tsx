"use client";

import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  PROFILE_SECTIONS,
  calculateProfileProgress,
  getSectionStatus,
  getRemainingProgressPercent,
  getRemainingSections,
  type Preferences,
} from "@/lib/profile-progress";
import type { Profile } from "@/types";
import { useTranslation } from "@/lib/i18n/context";

interface ProfileCompletionCardProps {
  profile: Profile;
  preferences?: Preferences | null;
  showContinue?: boolean;
  compact?: boolean;
}

export function ProfileCompletionCard({
  profile,
  preferences,
  showContinue = true,
}: ProfileCompletionCardProps) {
  const { t } = useTranslation();
  const progress = profile.questionnaireComplete
    ? 100
    : calculateProfileProgress(profile, preferences);
  const remainingPercent = profile.questionnaireComplete
    ? 0
    : getRemainingProgressPercent(profile, preferences);
  const remaining = getRemainingSections(profile, preferences);
  const completedCount = PROFILE_SECTIONS.filter(
    (s) => getSectionStatus(s.id, profile, preferences) === "complete"
  ).length;

  if (profile.questionnaireComplete) return null;

  return (
    <Card className="border-border shadow-sm">
      <CardContent className="p-6 space-y-5">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            {t("profileProgress.setupLabel")}
          </p>
          <h2 className="text-xl font-semibold mt-1">{t("profileProgress.completeToMatch")}</h2>
          <p className="text-sm text-muted-foreground mt-2">
            {t("profileProgress.sectionsDone", {
              completed: completedCount,
              total: PROFILE_SECTIONS.length,
            })}
            {remaining > 0
              ? t("profileProgress.remainingSuffix", { count: remaining })
              : ""}
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("profileProgress.progress")}</span>
            <span className="font-semibold">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
          {remainingPercent > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("profileProgress.remainingPercent", { percent: remainingPercent })}
            </p>
          )}
        </div>

        {showContinue && (
          <Button asChild className="w-full h-12 text-base" size="lg">
            <Link href="/questionnaire">
              {t("profileProgress.continueSetup")}
              <ChevronRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/** Compact row for profile page sidebar area */
export function ProfileProgressRow({
  profile,
  preferences,
}: {
  profile: Profile;
  preferences?: Preferences | null;
}) {
  const { t } = useTranslation();
  const progress = calculateProfileProgress(profile, preferences);
  if (profile.questionnaireComplete) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Check className="h-4 w-4 text-primary" />
        {t("profileProgress.complete")}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{t("profileProgress.progressLabel")}</span>
        <span className="font-medium">{progress}%</span>
      </div>
      <Progress value={progress} className="h-1.5" />
    </div>
  );
}
