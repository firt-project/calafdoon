"use client";

import Link from "next/link";
import { Heart, Lock, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  calculateProfileProgress,
  getEncouragementKey,
  getRemainingProgressPercent,
  getRemainingSections,
  type Preferences,
} from "@/lib/profile-progress";
import type { Profile } from "@/types";
import { useTranslation } from "@/lib/i18n/context";

interface ProfileLockedGateProps {
  profile: Profile;
  preferences?: Preferences | null;
  title?: string;
  description?: string;
}

export function ProfileLockedGate({
  profile,
  preferences,
  title,
  description,
}: ProfileLockedGateProps) {
  const { t } = useTranslation();
  const progress = calculateProfileProgress(profile, preferences);
  const remainingPercent = getRemainingProgressPercent(profile, preferences);
  const remaining = getRemainingSections(profile, preferences);
  const encouragementKey = getEncouragementKey(profile, preferences);
  const heading = title ?? t("profileProgress.lockedTitle");
  const body = description ?? t("profileProgress.lockedDesc");

  return (
    <div className="max-w-lg mx-auto py-8 px-2">
      <Card className="overflow-hidden text-center border-border shadow-xl shadow-primary/5">
        <div className="h-1.5 bg-gradient-to-r from-primary/80 via-primary to-primary/60" />
        <CardContent className="p-8 space-y-6">
          <div className="relative mx-auto w-fit">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent/60 text-primary dark:from-primary/20 dark:to-primary/10 dark:text-primary">
              <Heart className="h-9 w-9" />
            </div>
            <div className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-card border border-border shadow-sm">
              <Lock className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">{heading}</h1>
            <p className="text-muted-foreground leading-relaxed">{body}</p>
          </div>

          <div className="rounded-2xl bg-muted/50 p-4 space-y-3 text-left">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t("profileProgress.completionLabel")}</span>
              <span className="font-bold text-primary">{progress}%</span>
            </div>
            <Progress value={progress} className="h-3" />
            {remainingPercent > 0 && (
              <p className="text-xs font-medium text-primary">
                {t("profileProgress.remainingPercent", { percent: remainingPercent })}
              </p>
            )}
            {remaining > 0 && (
              <p className="text-xs text-muted-foreground">
                {remaining === 1
                  ? t("profileProgress.sectionRemaining", { count: remaining })
                  : t("profileProgress.sectionsRemaining", { count: remaining })}
              </p>
            )}
          </div>

          <div className="flex items-start gap-2 rounded-xl bg-accent/80 dark:bg-primary/10 p-4 text-left">
            <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <p className="text-sm text-accent-foreground dark:text-primary font-medium leading-relaxed">
              {t(`profileProgress.${encouragementKey}`)}
            </p>
          </div>

          <Button asChild size="lg" className="w-full">
            <Link href="/questionnaire">{t("profileProgress.continueProfile")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
