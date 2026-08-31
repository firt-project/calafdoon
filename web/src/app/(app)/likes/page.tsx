"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { MemberDataLoading } from "@/components/auth/member-data-loading";
import { Skeleton } from "@/components/ui/skeleton";
import { DataLoadError } from "@/components/ui/data-load-error";
import { MatchProfileModal } from "@/components/matches/match-profile-modal";
import {
  isSecondaryMatchList,
  MatchListsView,
  type SecondaryMatchList,
} from "@/components/matches/match-lists-view";
import { ProfileLockedGate } from "@/components/profile/profile-locked-gate";
import { PendingApprovalGate } from "@/components/profile/pending-approval-gate";
import { AccountLockedGate } from "@/components/profile/account-locked-gate";
import { PaymentGate } from "@/components/payment/payment-gate";
import type { MatchResult, Profile } from "@/types";
import type { Preferences } from "@/lib/profile-progress";
import { hasPaidAccess, isPremiumMember } from "@/lib/access";
import {
  needsApprovalGate,
  isInteractionLocked,
  resolveReviewStatus,
} from "@/lib/review-status";
import { useStaffRedirect } from "@/hooks/use-staff-redirect";
import { isMemberProfileReady, isProfileQueriesLoading } from "@/lib/profile-progress";
import { isTrialExpired } from "@/lib/trial";
import { formatMoney, planPricesForGender } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/context";
import { useMarkNotificationsRead } from "@/hooks/use-mark-notifications-read";
import { useProfile, usePreferencesQuery } from "@/data/profile/hooks";
import { useMatchLists, useLikeUser, useStartChat } from "@/data/matching/hooks";

export default function LikesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isStaff, isLoading: staffLoading } = useStaffRedirect();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [selectedMatch, setSelectedMatch] = useState<MatchResult | null>(null);

  const {
    profile: profileRaw,
    error: profileError,
    refresh: refreshProfile,
  } = useProfile();
  const profile = (
    staffLoading || isStaff ? undefined : profileRaw
  ) as Profile | null | undefined;
  const preferencesRaw = usePreferencesQuery();
  const preferences = (
    staffLoading || isStaff ? undefined : preferencesRaw
  ) as Preferences | null | undefined;
  const queriesLoading =
    !isStaff && isProfileQueriesLoading(profile, preferences);

  const profileReady =
    !!profile &&
    !queriesLoading &&
    (profile.questionnaireComplete || isMemberProfileReady(profile, preferences));
  const canQuery =
    profileReady &&
    hasPaidAccess(profile) &&
    !needsApprovalGate(profile) &&
    !isInteractionLocked(profile);
  const isPremium = isPremiumMember(profile);

  const {
    lists: matchListsRaw,
    error: listsError,
    refresh: refreshLists,
  } = useMatchLists({}, canQuery);
  const matchLists = (
    canQuery && matchListsRaw && typeof matchListsRaw === "object"
      ? matchListsRaw
      : undefined
  ) as
    | {
        shortlist?: MatchResult[];
        liked?: MatchResult[];
        likedYou?: MatchResult[];
        passed?: MatchResult[];
      }
    | undefined;

  const shortlistMatches = matchLists?.shortlist;
  const likedMatches = matchLists?.liked;
  const likedYouMatches = matchLists?.likedYou;
  const passedMatches = matchLists?.passed;

  const defaultTab: SecondaryMatchList = isPremium ? "likedYou" : "liked";
  const activeList = isSecondaryMatchList(tabParam) ? tabParam : defaultTab;

  useMarkNotificationsRead(
    activeList === "likedYou" ? ["like"] : activeList === "liked" ? ["match"] : [],
    canQuery
  );

  const setActiveList = useCallback(
    (list: SecondaryMatchList) => {
      router.replace(`/likes?tab=${list}`, { scroll: false });
    },
    [router]
  );

  const likeUser = useLikeUser();
  const startChat = useStartChat();

  const openChatFromResult = (result: {
    matched?: boolean;
    mutual?: boolean;
    conversationId?: string | null;
  }) => {
    const conversationId =
      typeof result.conversationId === "string" ? result.conversationId : null;
    if (result.mutual) {
      toast.success(t("matchesPage.matchedToast"));
    } else if (result.matched || conversationId) {
      toast.success(t("matchesPage.chatReadyToast"));
    }
    if (conversationId) {
      router.push(`/chat?c=${encodeURIComponent(conversationId)}`);
    }
  };

  const handleAction = async (
    userId: string,
    action: "like" | "pass" | "shortlist"
  ) => {
    try {
      const result = (await likeUser({ toUserId: userId, action })) as {
        matched?: boolean;
        mutual?: boolean;
        conversationId?: string | null;
      };
      if (action === "like" && (result.matched || result.conversationId)) {
        openChatFromResult(result);
      } else if (action === "shortlist") {
        toast.success(t("matchesPage.shortlistedToast"));
      } else if (action === "pass") {
        toast.message(t("matchesPage.passedToast"));
      }
    } catch {
      toast.error(t("matchesPage.errorToast"));
    }
  };

  const handleMessage = async (userId: string) => {
    try {
      const result = (await startChat(userId)) as {
        matched?: boolean;
        mutual?: boolean;
        conversationId?: string | null;
      };
      openChatFromResult(result);
      setSelectedMatch(null);
    } catch {
      toast.error(t("matchesPage.errorToast"));
    }
  };

  const listCounts = useMemo(
    () =>
      (shortlistMatches?.length ?? 0) +
      (likedMatches?.length ?? 0) +
      (passedMatches?.length ?? 0) +
      (isPremium ? likedYouMatches?.length ?? 0 : 0),
    [shortlistMatches, likedMatches, passedMatches, likedYouMatches, isPremium]
  );

  if (staffLoading || isStaff) {
    return (
      <DashboardLayout>
        <div className="w-full max-w-6xl mx-auto space-y-4" role="status" aria-busy>
          <Skeleton className="h-64 w-full rounded-2xl" aria-hidden />
        </div>
      </DashboardLayout>
    );
  }

  if (queriesLoading) {
    return (
      <DashboardLayout>
        <MemberDataLoading pending />
      </DashboardLayout>
    );
  }

  if (!isStaff && profileError && !profile) {
    return (
      <DashboardLayout>
        <DataLoadError
          message={profileError}
          onRetry={() => void refreshProfile()}
        />
      </DashboardLayout>
    );
  }

  if (profile && !profileReady) {
    return (
      <DashboardLayout>
        <ProfileLockedGate profile={profile} preferences={preferences} />
      </DashboardLayout>
    );
  }

  if (profile && !hasPaidAccess(profile)) {
    return (
      <DashboardLayout>
        <PaymentGate
          gender={profile.gender === "female" || profile.gender === "male" ? profile.gender : undefined}
          title={
            isTrialExpired(profile)
              ? t("payment.trialEndedTitle")
              : t("payment.profileReadyTitle")
          }
          description={
            isTrialExpired(profile)
              ? t("payment.trialEndedDesc", {
                  basic: formatMoney(planPricesForGender(profile.gender).basic),
                  premium: formatMoney(planPricesForGender(profile.gender).premium),
                })
              : t("payment.profileReadyDesc", {
                  basic: formatMoney(planPricesForGender(profile.gender).basic),
                  premium: formatMoney(planPricesForGender(profile.gender).premium),
                })
          }
        />
      </DashboardLayout>
    );
  }

  if (profile && isInteractionLocked(profile)) {
    const status = profile.banned
      ? "banned"
      : resolveReviewStatus(profile) === "paused"
        ? "paused"
        : "suspended";
    return (
      <DashboardLayout>
        <AccountLockedGate status={status} />
      </DashboardLayout>
    );
  }

  if (profile && needsApprovalGate(profile)) {
    return (
      <DashboardLayout>
        <PendingApprovalGate isPremium={isPremium} />
      </DashboardLayout>
    );
  }

  if (canQuery && listsError && matchLists === undefined) {
    return (
      <DashboardLayout>
        <DataLoadError
          message={listsError}
          onRetry={() => void refreshLists()}
        />
      </DashboardLayout>
    );
  }

  if (matchLists === undefined) {
    return (
      <DashboardLayout>
        <Skeleton className="h-64 w-full max-w-6xl mx-auto rounded-2xl" />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-5 mx-auto w-full max-w-6xl">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">{t("app.likes")}</h1>
          <p className="text-sm text-muted-foreground mt-1 sm:text-base">
            {listCounts > 0
              ? t("likesPage.summary", { count: listCounts })
              : t("likesPage.summaryEmpty")}
          </p>
        </div>

        <MatchListsView
          activeList={activeList}
          onListChange={setActiveList}
          shortlist={shortlistMatches ?? []}
          liked={likedMatches ?? []}
          likedYou={likedYouMatches ?? []}
          passed={passedMatches ?? []}
          isPremium={isPremium}
          onView={setSelectedMatch}
          onAction={handleAction}
          onMessage={(userId) => void handleMessage(userId)}
        />
      </div>

      {selectedMatch && (
        <MatchProfileModal
          match={selectedMatch}
          isPremium={isPremium}
          onClose={() => setSelectedMatch(null)}
          onLike={(action) => {
            void handleAction(selectedMatch.userId, action);
            setSelectedMatch(null);
          }}
          onMessage={() => {
            void handleMessage(selectedMatch.userId);
          }}
        />
      )}
    </DashboardLayout>
  );
}
