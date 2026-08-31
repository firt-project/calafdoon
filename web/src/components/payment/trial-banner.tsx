"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/context";
import { getTrialDaysRemaining, isInTrialPeriod } from "@/lib/trial";
import { markTrialWelcomeNoticeSeen, hasSeenTrialWelcomeNotice } from "@/lib/trial-notice";
import { REGISTRATION_PRICE, PERSONAL_SUPPORT_PRICE } from "@/lib/constants";
import type { Profile } from "@/types";

interface TrialBannerProps {
  profile: Pick<Profile, "trialEndsAt" | "hasPaid" | "isInTrial" | "userId">;
  className?: string;
}

export function TrialBanner({ profile, className }: TrialBannerProps) {
  const { t } = useTranslation();
  const userId = profile.userId;
  const inTrial = isInTrialPeriod(profile);
  const alreadySeen = userId ? hasSeenTrialWelcomeNotice(userId) : false;
  const shouldShow = inTrial && !alreadySeen;

  useEffect(() => {
    if (shouldShow && userId) {
      markTrialWelcomeNoticeSeen(userId);
    }
  }, [shouldShow, userId]);

  if (!shouldShow) {
    return null;
  }

  const daysLeft = getTrialDaysRemaining(profile);
  const dayLabel =
    daysLeft === 1
      ? t("trial.oneDayLeft")
      : t("trial.daysLeft", { count: daysLeft });

  return (
    <div
      className={`rounded-2xl border border-violet-200/80 bg-gradient-to-r from-violet-50 to-primary/5 px-4 py-3 sm:px-5 sm:py-4 dark:border-violet-900/50 dark:from-violet-950/40 dark:to-primary/10 ${className ?? ""}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              {t("trial.bannerTitle")}
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t("trial.bannerDesc", {
                days: dayLabel,
                basic: REGISTRATION_PRICE,
                premium: PERSONAL_SUPPORT_PRICE,
              })}
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0 rounded-xl">
          <Link href="/matches">{t("trial.browseMatches")}</Link>
        </Button>
      </div>
    </div>
  );
}
