"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  Heart,
  Sparkles,
  MessageCircle,
  Compass,
  Lock,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import type { MatchResult } from "@/types";
import { useHomeFeed, useLikeUser, useStartChat } from "@/data/matching/hooks";
import { useTranslation } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DataLoadError } from "@/components/ui/data-load-error";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LazyImage } from "@/components/ui/lazy-image";
import { CompatibilityHighlights } from "@/components/matches/compatibility-highlights";
import { cn } from "@/lib/utils";

type HomeFeedData = {
  dailyMatch?: MatchResult | null;
  likedYouCount?: number;
  likedYouPreview?: MatchResult[];
  likedYouLocked?: boolean;
  newMutualCount?: number;
  pendingChatCount?: number;
  discoverCount?: number;
  recentMutuals?: Array<{
    matchId: string;
    conversationId: string | null;
    score: number;
    isNew: boolean;
    name: string;
    imageUrl: string | null;
  }>;
};

interface MemberHomeFeedProps {
  firstName: string;
  canQuery: boolean;
}

export function MemberHomeFeed({ firstName, canQuery }: MemberHomeFeedProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    feed: feedRaw,
    error: feedError,
    refresh: refreshFeed,
  } = useHomeFeed(canQuery);
  const feed = (canQuery ? feedRaw : undefined) as HomeFeedData | null | undefined;
  const likeUser = useLikeUser();
  const startChat = useStartChat();

  if (canQuery && feedError && (feed === undefined || feed === null)) {
    return <DataLoadError message={feedError} onRetry={() => void refreshFeed()} />;
  }

  if (feed === undefined) {
    return (
      <div className="space-y-4" role="status" aria-busy>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full rounded-3xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
      </div>
    );
  }

  const daily = feed?.dailyMatch ?? null;
  const likedCount = feed?.likedYouCount ?? 0;
  const likedLocked = !!feed?.likedYouLocked;
  const likedPreview = Array.isArray(feed?.likedYouPreview)
    ? feed!.likedYouPreview!
    : [];

  const openChatFromResult = (result: {
    matched?: boolean;
    mutual?: boolean;
    conversationId?: string | null;
  }) => {
    const conversationId =
      typeof result.conversationId === "string" ? result.conversationId : null;
    if (result.mutual) toast.success(t("matchesPage.matchedToast"));
    else if (result.matched || conversationId)
      toast.success(t("matchesPage.chatReadyToast"));
    if (conversationId) {
      router.push(`/chat?c=${encodeURIComponent(conversationId)}`);
    } else {
      router.refresh();
    }
  };

  const onDailyAction = async (action: "like" | "pass" | "shortlist") => {
    if (!daily?.userId) return;
    try {
      const result = (await likeUser({
        toUserId: String(daily.userId),
        action,
      })) as {
        matched?: boolean;
        mutual?: boolean;
        conversationId?: string | null;
      };
      if (action === "like" && (result.matched || result.conversationId)) {
        openChatFromResult(result);
      } else if (action === "shortlist")
        toast.success(t("matchesPage.shortlistedToast"));
      else toast.message(t("matchesPage.passedToast"));
      if (action !== "like") router.refresh();
    } catch {
      toast.error(t("matchesPage.errorToast"));
    }
  };

  const onDailyMessage = async () => {
    if (!daily?.userId) return;
    try {
      const result = (await startChat(String(daily.userId))) as {
        matched?: boolean;
        mutual?: boolean;
        conversationId?: string | null;
      };
      openChatFromResult(result);
    } catch {
      toast.error(t("matchesPage.errorToast"));
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <section className="member-hero px-5 py-6 sm:px-7 sm:py-7">
        <div className="relative z-10 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
          <Heart className="h-3.5 w-3.5 fill-white/90 text-white/90" />
          {t("homeFeed.today")}
        </div>
        <h1 className="relative z-10 mt-2 font-display text-3xl sm:text-4xl font-semibold leading-tight">
          {t("homeFeed.hello", { name: firstName })}
        </h1>
        <p className="relative z-10 mt-1.5 max-w-md text-sm text-white/85">
          {t("homeFeed.subtitle")}
        </p>
      </section>

      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        <StatChip
          href="/matches"
          icon={<Compass className="h-5 w-5" />}
          label={t("homeFeed.discover")}
          value={feed?.discoverCount ?? 0}
          tone="rose"
        />
        <StatChip
          href="/likes?tab=likedYou"
          icon={<Sparkles className="h-5 w-5" />}
          label={t("homeFeed.likes")}
          value={likedCount}
          tone="gold"
        />
        <StatChip
          href="/chat"
          icon={<MessageCircle className="h-5 w-5" />}
          label={t("homeFeed.chats")}
          value={feed?.pendingChatCount ?? 0}
          tone="plum"
        />
      </div>

      <section className="romance-card rounded-3xl overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary/80">
              {t("homeFeed.dailyMatch")}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t("homeFeed.dailyMatchDesc")}
            </p>
          </div>
          <Badge
            variant="secondary"
            className="rounded-full border border-gold/30 bg-gold/10 text-gold-foreground"
          >
            {t("homeFeed.today")}
          </Badge>
        </div>

        {daily ? (
          <div className="px-4 pb-4 space-y-3">
            <div className="relative h-56 sm:h-64 rounded-2xl overflow-hidden bg-muted">
              {daily.imageUrl ? (
                <LazyImage
                  src={daily.imageUrl}
                  alt={daily.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/10 to-muted">
                  <Avatar className="h-20 w-20">
                    <AvatarFallback className="text-2xl">
                      {(daily.name || "?").charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                </div>
              )}
              <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
                <div className="rounded-2xl bg-black/45 text-white px-3 py-2 backdrop-blur-sm">
                  <p className="font-semibold text-sm">
                    {daily.name}
                    {typeof daily.age === "number" ? `, ${daily.age}` : ""}
                  </p>
                  <p className="text-xs opacity-90">
                    {[daily.city, daily.country].filter(Boolean).join(", ")}
                  </p>
                </div>
                <Badge className="bg-primary text-primary-foreground border-0">
                  {t("matchesPage.matchPercent", { score: daily.score ?? 0 })}
                </Badge>
              </div>
            </div>
            <CompatibilityHighlights keys={daily.highlightKeys} />
            <Button
              type="button"
              className="w-full rounded-full"
              onClick={() => void onDailyMessage()}
            >
              <MessageCircle className="h-4 w-4 mr-1.5" />
              {t("matchesPage.message")}
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 rounded-full"
                onClick={() => void onDailyAction("pass")}
              >
                {t("matchesPage.pass")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-full px-4"
                onClick={() => void onDailyAction("shortlist")}
              >
                {t("matchesPage.shortlist")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1 rounded-full"
                onClick={() => void onDailyAction("like")}
              >
                <Heart className="h-4 w-4 mr-1.5" />
                {t("matchesPage.like")}
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="w-full text-sm"
              onClick={() =>
                router.push(`/matches?user=${encodeURIComponent(String(daily.userId))}`)
              }
            >
              {t("homeFeed.viewProfile")}
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        ) : (
          <div className="px-4 pb-5 pt-2 text-center">
            <p className="text-sm text-muted-foreground">
              {t("homeFeed.noDailyMatch")}
            </p>
            <Button asChild className="mt-3 rounded-full">
              <Link href="/matches">{t("homeFeed.browseMatches")}</Link>
            </Button>
          </div>
        )}
      </section>

      <section className="romance-card rounded-3xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary/80">
              {t("homeFeed.likedYou")}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {likedCount > 0
                ? t("homeFeed.likedYouCount", { count: likedCount })
                : t("homeFeed.likedYouEmpty")}
            </p>
          </div>
          {likedLocked && likedCount > 0 && (
            <Badge variant="outline" className="rounded-full gap-1">
              <Lock className="h-3 w-3" />
              {t("homeFeed.premium")}
            </Badge>
          )}
        </div>

        {likedLocked && likedCount > 0 ? (
          <div className="rounded-2xl bg-muted/60 p-4 flex items-center justify-between gap-3">
            <div className="flex -space-x-2">
              {[0, 1, 2].slice(0, Math.min(3, likedCount)).map((i) => (
                <div
                  key={i}
                  className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/30 to-muted border-2 border-card blur-[1px]"
                />
              ))}
            </div>
            <Button asChild size="sm" className="rounded-full shrink-0">
              <Link href="/pricing">{t("homeFeed.unlockLikedYou")}</Link>
            </Button>
          </div>
        ) : likedPreview.length > 0 ? (
          <div className="space-y-2">
            {likedPreview.map((person) => (
              <button
                key={String(person.userId)}
                type="button"
                className="w-full flex items-center gap-3 rounded-2xl bg-muted/50 p-2.5 text-left hover:bg-muted transition-colors"
                onClick={() =>
                  router.push(
                    `/likes?tab=likedYou&user=${encodeURIComponent(String(person.userId))}`
                  )
                }
              >
                <Avatar className="h-11 w-11 border border-border">
                  <AvatarImage src={person.imageUrl ?? undefined} alt="" />
                  <AvatarFallback>
                    {(person.name || "?").charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">
                    {person.name}
                    {typeof person.age === "number" ? `, ${person.age}` : ""}
                  </p>
                  <CompatibilityHighlights
                    keys={person.highlightKeys}
                    className="mt-1"
                  />
                </div>
                <Badge variant="secondary" className="tabular-nums">
                  {Math.round(person.score ?? 0)}%
                </Badge>
              </button>
            ))}
            <Button asChild variant="ghost" size="sm" className="w-full">
              <Link href="/likes?tab=likedYou">{t("homeFeed.seeAllLikes")}</Link>
            </Button>
          </div>
        ) : (
          <Button asChild variant="outline" className="w-full rounded-full">
            <Link href="/matches">{t("homeFeed.browseMatches")}</Link>
          </Button>
        )}
      </section>

      {(feed?.recentMutuals?.length ?? 0) > 0 && (
        <section className="rounded-3xl border border-border/80 bg-card p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("homeFeed.recentMutuals")}
            </p>
            {(feed?.newMutualCount ?? 0) > 0 && (
              <Badge className="rounded-full">
                {t("homeFeed.newCount", { count: feed!.newMutualCount! })}
              </Badge>
            )}
          </div>
          <div className="space-y-2">
            {feed!.recentMutuals!.map((m) => (
              <button
                key={m.matchId}
                type="button"
                className="w-full flex items-center gap-3 rounded-2xl bg-muted/50 p-2.5 text-left hover:bg-muted transition-colors"
                onClick={() =>
                  router.push(
                    m.conversationId
                      ? `/chat?c=${encodeURIComponent(m.conversationId)}`
                      : "/chat"
                  )
                }
              >
                <Avatar className="h-11 w-11 border border-border">
                  <AvatarImage src={m.imageUrl ?? undefined} alt="" />
                  <AvatarFallback>{(m.name || "?").charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{m.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.isNew
                      ? t("homeFeed.newMutual")
                      : t("homeFeed.openChat")}
                  </p>
                </div>
                <MessageCircle className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>
      )}

      <Button asChild variant="outline" className="w-full rounded-full h-11">
        <Link href="/matches">
          <Compass className="h-4 w-4 mr-2" />
          {t("homeFeed.browseMatches")}
        </Link>
      </Button>
    </div>
  );
}

const STAT_TONES = {
  rose: "bg-primary/12 text-primary",
  gold: "bg-gold/15 text-gold-foreground dark:text-gold",
  plum: "bg-brand-dark/12 text-brand-dark dark:bg-primary/15 dark:text-primary",
} as const;

function StatChip({
  href,
  icon,
  label,
  value,
  tone = "rose",
}: {
  href: string;
  icon: ReactNode;
  label: string;
  value: number;
  tone?: keyof typeof STAT_TONES;
}) {
  return (
    <Link href={href} className="stat-card flex flex-col items-center gap-1.5 p-3.5">
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-2xl",
          STAT_TONES[tone]
        )}
      >
        {icon}
      </div>
      <p className="text-2xl font-bold tabular-nums leading-none">{value}</p>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
    </Link>
  );
}
