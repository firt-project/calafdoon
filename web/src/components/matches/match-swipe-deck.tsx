"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "framer-motion";
import {
  Bookmark,
  Eye,
  Heart,
  MapPin,
  Moon,
  CalendarHeart,
  Ruler,
  X,
  MessageCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LazyImage } from "@/components/ui/lazy-image";
import { PhotoGalleryLightbox } from "@/components/ui/photo-gallery-lightbox";
import { TrustBadges } from "@/components/profile/trust-badges";
import { CompatibilityHighlights } from "@/components/matches/compatibility-highlights";
import { ReportBlockMenu } from "@/components/safety/report-block-menu";
import { OnlineBadge } from "@/components/ui/online-status";
import type { MatchResult } from "@/types";
import { useTranslation } from "@/lib/i18n/context";
import { usePresence } from "@/data/presence/hooks";
import { cn } from "@/lib/utils";

const SWIPE_THRESHOLD = 96;

interface MatchSwipeDeckProps {
  matches: MatchResult[];
  startUserId?: string;
  actionBusyId?: string | null;
  onView: (match: MatchResult) => void;
  onAction: (
    userId: string,
    action: "like" | "pass" | "shortlist"
  ) => Promise<void>;
  onMessage?: (userId: string) => void | Promise<void>;
}

function SwipeCard({
  match,
  onView,
  onAction,
  onMessage,
  onDismiss,
  externalBusy,
}: {
  match: MatchResult;
  onView: () => void;
  onAction: (action: "like" | "pass" | "shortlist") => Promise<void>;
  onMessage?: () => void | Promise<void>;
  onDismiss: (direction: "left" | "right") => void;
  externalBusy?: boolean;
}) {
  const { t } = useTranslation();
  const { isOnline, seed } = usePresence();
  const online = isOnline(match.userId, !!match.isOnline);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-180, 180], [-12, 12]);
  const likeOpacity = useTransform(x, [40, SWIPE_THRESHOLD], [0, 1]);
  const passOpacity = useTransform(x, [-SWIPE_THRESHOLD, -40], [1, 0]);
  const [busy, setBusy] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);

  useEffect(() => {
    seed([{ userId: match.userId, isOnline: match.isOnline }]);
  }, [match.userId, match.isOnline, seed]);

  const location = [match.city, match.country].filter(Boolean).join(", ");
  const photos = useMemo(() => {
    const extra = Array.isArray(match.additionalImageUrls)
      ? match.additionalImageUrls
      : [];
    return [match.imageUrl, ...extra].filter(
      (url): url is string => typeof url === "string" && url.length > 0
    );
  }, [match.imageUrl, match.additionalImageUrls]);

  const openGallery = (index = 0) => {
    if (!photos.length) return;
    setGalleryIndex(index);
    setGalleryOpen(true);
  };

  const runAction = async (
    action: "like" | "pass" | "shortlist",
    direction?: "left" | "right"
  ) => {
    if (busy || externalBusy || (action === "like" && match.liked)) return;
    setBusy(true);
    try {
      await onAction(action);
      if (direction) {
        onDismiss(direction);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > SWIPE_THRESHOLD) {
      void runAction("like", "right");
      return;
    }
    if (info.offset.x < -SWIPE_THRESHOLD) {
      void runAction("pass", "left");
    }
  };

  return (
    <>
      <div className="relative w-full">
        <motion.div
          className="relative w-full touch-pan-y"
          style={{ x, rotate }}
          drag={busy ? false : "x"}
          dragElastic={0.85}
          dragConstraints={{ left: 0, right: 0 }}
          onDragEnd={handleDragEnd}
          whileTap={{ cursor: "grabbing" }}
        >
          <motion.div
            className="pointer-events-none absolute left-6 top-8 z-10 rounded-xl border-2 border-primary px-4 py-2 text-primary font-bold tracking-wide rotate-[-12deg]"
            style={{ opacity: likeOpacity }}
          >
            {t("matchesPage.swipeLike")}
          </motion.div>
          <motion.div
            className="pointer-events-none absolute right-6 top-8 z-10 rounded-xl border-2 border-rose-500 px-4 py-2 text-rose-600 font-bold tracking-wide rotate-[12deg]"
            style={{ opacity: passOpacity }}
          >
            {t("matchesPage.swipePass")}
          </motion.div>

          <Card className="overflow-hidden shadow-xl border-border/80">
            <div className="relative">
              <button
                type="button"
                className="relative block w-full h-[min(58vh,34rem)] lg:h-[min(62vh,38rem)] bg-gradient-to-br from-accent to-accent/50 dark:from-primary/20 dark:to-primary/10"
                onClick={() => openGallery(0)}
                disabled={!photos.length}
              >
                {match.imageUrl ? (
                  <LazyImage
                    src={match.imageUrl}
                    alt={match.name || "Member"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2">
                    <Avatar className="h-24 w-24">
                      <AvatarFallback className="text-4xl font-display">
                        {(match.name || "?").charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    {match.photoHidden && (
                      <p className="text-xs text-muted-foreground px-6 text-center">
                        {t("matchesPage.photoPrivate")}
                      </p>
                    )}
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/75 to-transparent" />
                <div className="absolute bottom-5 left-5 right-5 text-left text-white">
                  <p className="text-2xl font-semibold sm:text-3xl">
                    {match.name || "Member"}
                    {typeof match.age === "number" ? `, ${match.age}` : ""}
                  </p>
                  <p className="text-sm text-white/90 flex items-center gap-1 mt-1 sm:text-base">
                    <MapPin className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                    {location}
                  </p>
                </div>
                <div className="absolute top-3 right-3">
                  <Badge className="px-3 py-1.5 text-base font-bold bg-primary text-primary-foreground border-0 shadow-lg sm:text-lg">
                    {t("matchesPage.matchPercent", {
                      score: typeof match.score === "number" ? match.score : 0,
                    })}
                  </Badge>
                </div>
                {photos.length > 1 && (
                  <div className="absolute bottom-5 right-5 flex gap-1">
                    {photos.map((_, i) => (
                      <span
                        key={i}
                        className={cn(
                          "h-1.5 rounded-full bg-white/50",
                          i === 0 ? "w-4 bg-white" : "w-1.5"
                        )}
                      />
                    ))}
                  </div>
                )}
              </button>
              <div
                className="absolute top-3 left-3 z-10 flex flex-col items-start gap-2"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <OnlineBadge online={online} label={t("matchesPage.online")} />
                <ReportBlockMenu
                  userId={String(match.userId)}
                  userName={match.name || "Member"}
                  compact
                />
              </div>
            </div>

            {photos.length > 1 && (
              <div className="flex gap-2 px-4 -mt-3 relative z-10 overflow-x-auto pb-1">
                {photos.slice(1).map((url, i) => (
                  <button
                    key={`${url}-${i}`}
                    type="button"
                    onClick={() => openGallery(i + 1)}
                    className="h-14 w-14 shrink-0 rounded-xl overflow-hidden ring-2 ring-card shadow-md"
                  >
                    <LazyImage
                      src={url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}

            <CardContent className="p-5 space-y-4">
              <TrustBadges profile={match} size="sm" />
              <CompatibilityHighlights keys={match.highlightKeys} className="mt-2" />
              <div className="grid grid-cols-2 gap-2">
                {(match.prayerFrequency || match.religiousLevel) && (
                  <div className="flex items-center gap-2 rounded-xl bg-muted/60 px-2.5 py-2 text-xs text-muted-foreground">
                    <Moon className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="truncate">
                      {match.prayerFrequency || match.religiousLevel}
                    </span>
                  </div>
                )}
                {match.height ? (
                  <div className="flex items-center gap-2 rounded-xl bg-muted/60 px-2.5 py-2 text-xs text-muted-foreground">
                    <Ruler className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span>{match.height} cm</span>
                  </div>
                ) : null}
                {match.marriageTimeline ? (
                  <div className="flex items-center gap-2 rounded-xl bg-muted/60 px-2.5 py-2 text-xs text-muted-foreground col-span-2">
                    <CalendarHeart className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="truncate">{match.marriageTimeline}</span>
                  </div>
                ) : null}
              </div>
              {match.bio && (
                <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                  {match.bio}
                </p>
              )}
              <p className="text-xs text-muted-foreground text-center">
                {photos.length > 0
                  ? t("gallery.tapToView")
                  : t("matchesPage.swipeHint")}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Actions outside the drag layer so View/Like clicks always fire. */}
        <div
          className="flex flex-col items-center gap-2 pt-4"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col items-stretch gap-2 sm:gap-3">
            {onMessage ? (
              <Button
                type="button"
                className="h-12 w-full rounded-full"
                disabled={busy || !!externalBusy}
                onClick={() => void onMessage()}
              >
                <MessageCircle className="h-5 w-5 mr-1.5" />
                {t("matchesPage.message")}
              </Button>
            ) : null}
            <div className="flex items-center justify-center gap-2 sm:gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-12 rounded-full border-rose-200 px-4 text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950/30"
                disabled={busy || !!externalBusy}
                onClick={() => void runAction("pass", "left")}
              >
                <X className="h-5 w-5 mr-1.5" />
                {t("matchesPage.pass")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 rounded-full"
                disabled={busy || !!externalBusy || match.shortlisted}
                onClick={() => void runAction("shortlist")}
                aria-label={t("matchesPage.shortlist")}
              >
                <Bookmark className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 rounded-full"
                disabled={busy || !!externalBusy}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onView();
                }}
                aria-label={t("matchesPage.view")}
              >
                <Eye className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                className={cn(
                  "h-12 rounded-full px-4",
                  match.liked && "opacity-60"
                )}
                disabled={busy || !!externalBusy || match.liked}
                onClick={() => void runAction("like", "right")}
              >
                <Heart className="h-5 w-5 mr-1.5" />
                {match.liked ? t("matchesPage.liked") : t("matchesPage.like")}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center px-4">
            {t("matchesPage.swipeNextHint")}
          </p>
        </div>
      </div>

      <PhotoGalleryLightbox
        images={photos}
        initialIndex={galleryIndex}
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        alt={match.name || "Member"}
      />
    </>
  );
}

export function MatchSwipeDeck({
  matches,
  startUserId,
  actionBusyId,
  onView,
  onAction,
  onMessage,
}: MatchSwipeDeckProps) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [exitDirection, setExitDirection] = useState<"left" | "right" | null>(
    null
  );
  const appliedStartUserRef = useRef<string | null>(null);

  useEffect(() => {
    appliedStartUserRef.current = null;
  }, [startUserId]);

  // Jump to a specific profile (e.g. from dashboard) once when the list loads.
  useEffect(() => {
    if (!startUserId || matches.length === 0) return;
    if (appliedStartUserRef.current === startUserId) return;
    const targetIndex = matches.findIndex((m) => m.userId === startUserId);
    if (targetIndex >= 0) {
      setIndex(targetIndex);
      setExitDirection(null);
      appliedStartUserRef.current = startUserId;
    }
  }, [startUserId, matches]);

  // When someone is liked/passed they drop off the list — keep the same index so the next person appears.
  useEffect(() => {
    setIndex((prev) => {
      if (matches.length === 0) return 0;
      return Math.min(prev, matches.length - 1);
    });
  }, [matches]);

  const current = matches[index];

  if (!current) {
    return (
      <Card className="p-10 text-center">
        <Heart className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="font-semibold">{t("matchesPage.swipeDoneTitle")}</p>
        <p className="text-sm text-muted-foreground mt-2">
          {t("matchesPage.swipeDoneDesc")}
        </p>
      </Card>
    );
  }

  const handleDismiss = (direction: "left" | "right") => {
    setExitDirection(direction);
    window.setTimeout(() => {
      setExitDirection(null);
      // Do not increment index — the liked/passed user is removed from `matches`,
      // so the same index now points at the next profile.
    }, 180);
  };

  return (
    <div className="relative min-h-[36rem] pb-2">
      <motion.div
        key={current.userId}
        initial={{ scale: 0.96, opacity: 0 }}
        animate={
          exitDirection
            ? {
                x: exitDirection === "right" ? 320 : -320,
                opacity: 0,
                rotate: exitDirection === "right" ? 12 : -12,
              }
            : { scale: 1, opacity: 1, x: 0, rotate: 0 }
        }
        transition={{ duration: 0.18 }}
      >
        <SwipeCard
          match={current}
          onView={() => onView(current)}
          onAction={(action) => onAction(current.userId, action)}
          onMessage={
            onMessage
              ? () => onMessage(current.userId)
              : undefined
          }
          onDismiss={handleDismiss}
          externalBusy={actionBusyId === current.userId}
        />
      </motion.div>
      <p className="text-center text-xs text-muted-foreground mt-4">
        {t("matchesPage.swipeProgress", {
          current: Math.min(index + 1, matches.length),
          total: matches.length,
        })}
      </p>
    </div>
  );
}
