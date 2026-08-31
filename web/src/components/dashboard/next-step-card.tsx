"use client";

import Link from "next/link";
import {
  ArrowRight,
  ClipboardList,
  CreditCard,
  Heart,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { usePreferencesQuery } from "@/data/profile/hooks";
import { useMemberReminders } from "@/data/notifications/hooks";
import type { CurrentUser, MatchResult, MemberReminder, MemberReminderId } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { hasPaidAccess } from "@/lib/access";
import { formatMoney, planPricesForGender } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/context";
import { reminderCopy } from "@/lib/reminder-copy";
import {
  calculateProfileProgress,
  getRemainingProgressPercent,
  type Preferences,
} from "@/lib/profile-progress";
import { Progress } from "@/components/ui/progress";

const reminderIcons: Record<MemberReminderId, typeof ClipboardList> = {
  "complete-profile": ClipboardList,
  "complete-payment": CreditCard,
  "free-trial-active": Sparkles,
  "pending-approval": ShieldCheck,
  "browse-matches": Search,
};

interface NextStepCardProps {
  user: CurrentUser;
  matches?: MatchResult[];
  mutualCount?: number;
}

export function NextStepCard({ user, matches, mutualCount = 0 }: NextStepCardProps) {
  const { t } = useTranslation();
  const preferences = usePreferencesQuery() as Preferences | null | undefined;
  const remindersRaw = useMemberReminders();
  const reminders = Array.isArray(remindersRaw)
    ? (remindersRaw as MemberReminder[])
    : [];

  const profile = user.profile;
  const isComplete = profile?.questionnaireComplete ?? false;
  const hasPaid = hasPaidAccess(profile);
  const discoverCount = matches?.length ?? 0;
  const profileProgress = profile
    ? calculateProfileProgress(profile, preferences ?? undefined)
    : 0;
  const remainingProgress = profile
    ? getRemainingProgressPercent(profile, preferences ?? undefined)
    : 100;

  let title: string;
  let body: string;
  let href: string;
  let action: string;
  let Icon = ClipboardList;

  const primaryReminder = reminders?.[0];

  if (primaryReminder) {
    const copy = reminderCopy[primaryReminder.id];
    title = t(copy.title);
    body =
      primaryReminder.id === "complete-profile"
        ? t(copy.body, {
            percent: profileProgress,
            remaining: remainingProgress,
          })
        : t(copy.body);
    href = primaryReminder.href;
    action = t(copy.action);
    Icon = reminderIcons[primaryReminder.id];
  } else if (isComplete && hasPaid) {
    title = t("dashboard.nextBrowseTitle");
    body =
      discoverCount > 0
        ? t("dashboard.nextBrowseDesc", { count: discoverCount })
        : t("dashboard.noMatchesDesc");
    href = "/matches";
    action = t("dashboard.nextBrowseAction");
    Icon = Heart;
  } else {
    return null;
  }

  const showMatchPreview =
    isComplete && hasPaid && matches && matches.length > 0;

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-primary/20 shadow-lg shadow-primary/5">
        <div className="h-1 bg-gradient-to-r from-primary/80 via-primary to-primary/60" />
        <CardContent className="p-5 sm:p-6 space-y-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Icon className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                {t("dashboard.nextStepLabel")}
              </p>
              <h2 className="text-xl font-semibold mt-1 leading-snug">{title}</h2>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{body}</p>
              {primaryReminder?.id === "complete-profile" && !isComplete && (
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{t("profileProgress.progress")}</span>
                    <span className="font-semibold text-primary">{profileProgress}%</span>
                  </div>
                  <Progress value={profileProgress} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    {t("profileProgress.remainingPercent", { percent: remainingProgress })}
                  </p>
                </div>
              )}
              {!hasPaid && isComplete && (
                <p className="text-xs text-muted-foreground mt-2">
                  {t("dashboard.payToContinue", {
                    basic: formatMoney(planPricesForGender(user.profile?.gender).basic),
                    premium: formatMoney(planPricesForGender(user.profile?.gender).premium),
                  })}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button asChild className="rounded-xl">
              <Link href={href}>
                {action}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
            {isComplete && hasPaid && (
              <div className="flex gap-4 text-sm text-muted-foreground">
                <span>
                  <strong className="text-foreground">{discoverCount}</strong>{" "}
                  {t("dashboard.suggestedShort").toLowerCase()}
                </span>
                <span>
                  <strong className="text-foreground">{mutualCount}</strong>{" "}
                  {t("dashboard.matches").toLowerCase()}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {showMatchPreview && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {t("dashboard.suggested")}
            </h3>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/matches">{t("dashboard.seeAll")}</Link>
            </Button>
          </div>
          <div className="space-y-2">
            {matches.slice(0, 2).map((match) => (
              <Link key={match.userId} href={`/matches?user=${match.userId}`}>
                <Card className="border-border/80 hover:border-primary/30 transition-colors">
                  <CardContent className="p-3 flex items-center gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={match.imageUrl ?? undefined} alt={match.name} />
                      <AvatarFallback>{match.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {match.name}, {match.age}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{match.country}</p>
                    </div>
                    <span className="text-sm font-semibold text-primary shrink-0">
                      {match.score}%
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
