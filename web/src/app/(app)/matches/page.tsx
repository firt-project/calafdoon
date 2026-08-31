"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { HeartHandshake, X } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { MemberDataLoading } from "@/components/auth/member-data-loading";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DataLoadError } from "@/components/ui/data-load-error";
import { MatchProfileModal } from "@/components/matches/match-profile-modal";
import { MatchProfileCard } from "@/components/matches/match-profile-card";
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
import { isInTrialPeriod, isTrialExpired } from "@/lib/trial";
import { TrialBanner } from "@/components/payment/trial-banner";
import { formatMoney, planPricesForGender } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/context";
import { useMarkNotificationsRead } from "@/hooks/use-mark-notifications-read";
import { useProfile, usePreferencesQuery } from "@/data/profile/hooks";
import { useMatches, useLikeUser, useStartChat } from "@/data/matching/hooks";
import { usePresence } from "@/data/presence/hooks";
import { cn } from "@/lib/utils";

type DiscoverTab = "discover" | "online" | "new" | "nearby";

export default function MatchesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isStaff, isLoading: staffLoading } = useStaffRedirect();
  const searchParams = useSearchParams();
  const focusUserId = searchParams.get("user") ?? undefined;
  const openedFocusRef = useRef<string | null>(null);
  const [discoverTab, setDiscoverTab] = useState<DiscoverTab>("discover");
  const [dismissCompleteBanner, setDismissCompleteBanner] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MatchResult | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const { isOnline, seed: seedPresence } = usePresence();

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

  useMarkNotificationsRead(["match", "approval"], canQuery);

  const {
    matches: discoverMatchesRaw,
    isRefreshing: matchesRefreshing,
    error: matchesError,
    refresh: refreshMatches,
  } = useMatches({}, canQuery);
  const discoverMatches = (
    canQuery && Array.isArray(discoverMatchesRaw) ? discoverMatchesRaw : undefined
  ) as MatchResult[] | undefined;
  const [hiddenUserIds, setHiddenUserIds] = useState<Set<string>>(() => new Set());

  const likeUser = useLikeUser();
  const startChat = useStartChat();

  const matchList = useMemo(
    () =>
      (discoverMatches ?? []).filter((m) => !hiddenUserIds.has(m.userId)),
    [discoverMatches, hiddenUserIds]
  );

  useEffect(() => {
    if (!matchList.length) return;
    seedPresence(
      matchList.map((m) => ({ userId: m.userId, isOnline: m.isOnline }))
    );
  }, [matchList, seedPresence]);

  const filteredMatches = useMemo(() => {
    if (discoverTab === "online") {
      return matchList.filter((m) => isOnline(m.userId, !!m.isOnline));
    }
    if (discoverTab === "nearby") {
      const city = profile?.city?.trim().toLowerCase();
      const country = profile?.country?.trim().toLowerCase();
      return matchList.filter((m) => {
        const mCity = m.city?.trim().toLowerCase();
        const mCountry = m.country?.trim().toLowerCase();
        if (city && mCity && city === mCity) return true;
        if (country && mCountry && country === mCountry) return true;
        return false;
      });
    }
    return matchList;
  }, [discoverTab, matchList, isOnline, profile?.city, profile?.country]);

  // Open the profile the user tapped on the dashboard (?user=).
  useEffect(() => {
    if (!focusUserId || !discoverMatches?.length) return;
    if (openedFocusRef.current === focusUserId) return;
    const match = discoverMatches.find((m) => m.userId === focusUserId);
    if (match) {
      setSelectedMatch(match);
      openedFocusRef.current = focusUserId;
    }
  }, [focusUserId, discoverMatches]);

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
    if (actionBusyId === userId) return;
    setActionBusyId(userId);
    const hideCard = action === "pass" || action === "like";
    if (hideCard) {
      setHiddenUserIds((prev) => new Set(prev).add(userId));
    }
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
      if (hideCard) {
        setHiddenUserIds((prev) => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
      }
      toast.error(t("matchesPage.errorToast"));
    } finally {
      setActionBusyId(null);
    }
  };

  const handleMessage = async (userId: string) => {
    if (actionBusyId === userId) return;
    setActionBusyId(userId);
    try {
      const result = (await startChat(userId)) as {
        matched?: boolean;
        mutual?: boolean;
        conversationId?: string | null;
      };
      openChatFromResult(result);
      setSelectedMatch(null);
      if (focusUserId) {
        router.replace("/matches", { scroll: false });
      }
    } catch {
      toast.error(t("matchesPage.errorToast"));
    } finally {
      setActionBusyId(null);
    }
  };

  if (staffLoading || isStaff) {
    return (
      <DashboardLayout>
        <div className="w-full max-w-6xl mx-auto space-y-4" role="status" aria-busy>
          <Skeleton className="h-[36rem] w-full rounded-2xl" aria-hidden />
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

  if (canQuery && matchesError && discoverMatches === undefined) {
    return (
      <DashboardLayout>
        <DataLoadError
          message={matchesError}
          onRetry={() => void refreshMatches()}
        />
      </DashboardLayout>
    );
  }

  if (discoverMatches === undefined && !matchesRefreshing) {
    return (
      <DashboardLayout>
        <Skeleton className="h-[36rem] w-full max-w-2xl mx-auto rounded-2xl" />
      </DashboardLayout>
    );
  }

  const showCompleteBanner =
    !!profile &&
    !dismissCompleteBanner &&
    !profile.questionnaireComplete;

  const tabs: Array<{ id: DiscoverTab; label: string }> = [
    { id: "discover", label: t("matchesPage.tabDiscover") },
    { id: "online", label: t("matchesPage.tabOnline") },
    { id: "new", label: t("matchesPage.tabNew") },
    { id: "nearby", label: t("matchesPage.tabNearby") },
  ];

  const emptyTitle =
    discoverTab === "online"
      ? t("matchesPage.noOnlineTitle")
      : discoverTab === "nearby"
        ? t("matchesPage.noNearbyTitle")
        : t("matchesPage.noMatchesTitle");
  const emptyDesc =
    discoverTab === "online"
      ? t("matchesPage.noOnlineDesc")
      : discoverTab === "nearby"
        ? t("matchesPage.noNearbyDesc")
        : t("matchesPage.noMatchesDesc");

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-2xl space-y-4 pb-24 sm:space-y-5">
        {profile && isInTrialPeriod(profile) && <TrialBanner profile={profile} />}

        <nav
          className="flex min-w-0 gap-1 overflow-x-auto pb-0.5"
          aria-label={t("matchesPage.discoverTitle")}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setDiscoverTab(tab.id)}
              className={cn(
                "shrink-0 rounded-none border-b-2 px-3 py-2 text-sm font-semibold transition-colors",
                discoverTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="rounded-2xl border border-primary/15 bg-accent/50 p-4">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <HeartHandshake className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {t("matchesPage.faithBannerTitle")}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                {t("matchesPage.faithBannerBody")}
              </p>
              <Link
                href="/about"
                className="mt-2 inline-block text-sm font-semibold text-primary"
              >
                {t("matchesPage.faithBannerCta")}
              </Link>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold sm:text-lg">
            {t("matchesPage.recommended")}
          </h2>
          <button
            type="button"
            className="text-sm font-semibold text-primary"
            onClick={() => setDiscoverTab("discover")}
          >
            {t("matchesPage.seeAll")}
          </button>
        </div>

        {filteredMatches.length === 0 ? (
          <Card className="p-10 text-center sm:p-12">
            <h3 className="text-lg font-semibold mb-2">{emptyTitle}</h3>
            <p className="text-muted-foreground text-sm">{emptyDesc}</p>
          </Card>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {filteredMatches.map((match, i) => (
              <MatchProfileCard
                key={match.userId}
                match={match}
                index={i}
                busy={actionBusyId === match.userId}
                onView={() => setSelectedMatch(match)}
                onAction={(action) => void handleAction(match.userId, action)}
                onMessage={() => void handleMessage(match.userId)}
              />
            ))}
          </div>
        )}
      </div>

      {showCompleteBanner ? (
        <div className="fixed inset-x-0 bottom-[calc(var(--app-tabbar)+env(safe-area-inset-bottom,0px)+0.5rem)] z-30 px-3 sm:px-4">
          <div className="mx-auto flex max-w-2xl items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-lg">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {t("matchesPage.completeProfileBannerTitle")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("matchesPage.completeProfileBannerBody")}
              </p>
            </div>
            <Button asChild size="sm" className="shrink-0 rounded-full">
              <Link href="/questionnaire">{t("matchesPage.completeProfileCta")}</Link>
            </Button>
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              onClick={() => setDismissCompleteBanner(true)}
              aria-label={t("common.a11yClose")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      {selectedMatch && (
        <MatchProfileModal
          match={selectedMatch}
          isPremium={isPremium}
          busy={actionBusyId === selectedMatch.userId}
          onClose={() => {
            setSelectedMatch(null);
            if (focusUserId) {
              router.replace("/matches", { scroll: false });
            }
          }}
          onLike={(action) => {
            void handleAction(selectedMatch.userId, action);
            setSelectedMatch(null);
            if (focusUserId) {
              router.replace("/matches", { scroll: false });
            }
          }}
          onMessage={() => {
            void handleMessage(selectedMatch.userId);
          }}
        />
      )}
    </DashboardLayout>
  );
}
