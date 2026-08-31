"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePreferencesQuery } from "@/data/profile/hooks";
import type { Profile, CurrentUser } from "@/types";
import type { Preferences } from "@/lib/profile-progress";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { MemberDataLoading } from "@/components/auth/member-data-loading";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfileCompletionCard } from "@/components/profile/profile-completion-card";
import { NextStepCard } from "@/components/dashboard/next-step-card";
import { MemberHomeFeed } from "@/components/dashboard/member-home-feed";
import { TrialBanner } from "@/components/payment/trial-banner";
import { useStaffRedirect } from "@/hooks/use-staff-redirect";
import { hasPaidAccess } from "@/lib/access";
import { isInTrialPeriod } from "@/lib/trial";
import { useTranslation } from "@/lib/i18n/context";
import {
  calculateProfileProgress,
  getRemainingProgressPercent,
  isProfileQueriesLoading,
} from "@/lib/profile-progress";
import { needsApprovalGate } from "@/lib/review-status";

export default function DashboardPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, isStaff, isLoading } = useStaffRedirect();
  const preferencesRaw = usePreferencesQuery();
  const preferences = (
    user !== undefined && !isStaff ? preferencesRaw : undefined
  ) as Preferences | null | undefined;
  const profile = (
    user === undefined ? undefined : (user?.profile ?? null)
  ) as Profile | null | undefined;
  const queriesLoading =
    isLoading || (!isStaff && isProfileQueriesLoading(profile, preferences));

  const profileReady = !!profile?.questionnaireComplete;
  const canViewFeed =
    profileReady &&
    !isStaff &&
    hasPaidAccess(profile) &&
    !needsApprovalGate(profile);

  useEffect(() => {
    if (isStaff) {
      router.replace("/admin");
    }
  }, [router, isStaff]);

  if (isStaff) {
    return (
      <DashboardLayout>
        <div className="space-y-6 max-w-2xl" role="status" aria-busy>
          <Skeleton className="h-8 w-48" aria-hidden />
          <Skeleton className="h-40 w-full rounded-2xl" aria-hidden />
        </div>
      </DashboardLayout>
    );
  }

  if (user === undefined || queriesLoading) {
    return (
      <DashboardLayout>
        <MemberDataLoading pending />
      </DashboardLayout>
    );
  }

  const firstName = profile?.name?.split(" ")[0] ?? t("dashboard.guestName");
  const isComplete = profileReady;
  const profileProgress = profile
    ? calculateProfileProgress(profile, preferences ?? undefined)
    : 0;
  const remainingProgress = profile
    ? getRemainingProgressPercent(profile, preferences ?? undefined)
    : 100;

  if (canViewFeed) {
    return (
      <DashboardLayout>
        <MemberHomeFeed firstName={firstName} canQuery={canViewFeed} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            {t("dashboard.hello", { name: firstName })}
          </h1>
          {!isComplete && profile && (
            <p className="text-sm text-muted-foreground mt-2">
              {t("dashboard.profileProgressHint", {
                percent: profileProgress,
                remaining: remainingProgress,
              })}
            </p>
          )}
        </div>

        {profile && isInTrialPeriod(profile) && (
          <TrialBanner profile={profile} />
        )}

        {user && (
          <NextStepCard
            user={user as unknown as CurrentUser}
            matches={undefined}
            mutualCount={0}
          />
        )}

        {profile && !isComplete && (
          <ProfileCompletionCard profile={profile} preferences={preferences} />
        )}
      </div>
    </DashboardLayout>
  );
}
