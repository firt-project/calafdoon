"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { Heart, BadgeCheck } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { LazyImage } from "@/components/ui/lazy-image";
import { OnlineBadge } from "@/components/ui/online-status";
import { ReportBlockMenu } from "@/components/safety/report-block-menu";
import { CompatibilityRing } from "@/components/matches/compatibility-ring";
import {
  buildProfileFacts,
  ProfileFactChips,
} from "@/components/matches/profile-fact-chips";
import type { MatchResult } from "@/types";
import { useTranslation } from "@/lib/i18n/context";
import { usePresence } from "@/data/presence/hooks";
import { cn } from "@/lib/utils";

interface MatchProfileCardProps {
  match: MatchResult;
  index?: number;
  busy?: boolean;
  onView: () => void;
  onAction: (action: "like" | "pass" | "shortlist") => void;
  onMessage?: () => void;
}

export function MatchProfileCard({
  match,
  index = 0,
  busy = false,
  onView,
  onAction,
}: MatchProfileCardProps) {
  const { t } = useTranslation();
  const { isOnline, seed } = usePresence();
  const online = isOnline(match.userId, !!match.isOnline);

  useEffect(() => {
    seed([{ userId: match.userId, isOnline: match.isOnline }]);
  }, [match.userId, match.isOnline, seed]);

  const location = [match.city, match.country].filter(Boolean).join(", ");
  const meta = [match.age, location].filter(Boolean).join(" • ");
  const facts = buildProfileFacts(match);

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.3 }}
      className="rounded-xl border border-border/80 bg-card p-3 shadow-sm sm:p-4"
    >
      <div className="flex gap-3 sm:gap-4">
        <button
          type="button"
          onClick={onView}
          className="relative h-[9.5rem] w-[7.25rem] shrink-0 overflow-hidden rounded-lg bg-muted sm:h-[11rem] sm:w-[8.5rem]"
          aria-label={t("matchesPage.view")}
        >
          {match.imageUrl ? (
            <LazyImage
              src={match.imageUrl}
              alt={match.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-primary/10 to-accent">
              <Avatar className="h-14 w-14">
                <AvatarFallback className="text-xl font-display">
                  {(match.name || "?").charAt(0)}
                </AvatarFallback>
              </Avatar>
              {match.photoHidden ? (
                <p className="px-2 text-center text-[10px] text-muted-foreground">
                  {t("matchesPage.photoPrivate")}
                </p>
              ) : null}
            </div>
          )}
          <div className="absolute left-2 top-2">
            <OnlineBadge online={online} label={t("matchesPage.online")} />
          </div>
          <button
            type="button"
            className={cn(
              "absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-primary shadow-sm",
              match.shortlisted && "bg-primary text-primary-foreground"
            )}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!match.shortlisted) onAction("shortlist");
            }}
            disabled={busy || match.shortlisted}
            aria-label={t("matchesPage.shortlist")}
          >
            <Heart
              className={cn("h-3.5 w-3.5", match.shortlisted && "fill-current")}
            />
          </button>
        </button>

        <div className="min-w-0 flex-1 flex flex-col">
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              onClick={onView}
              className="min-w-0 text-left"
            >
              <h3 className="flex items-center gap-1.5 font-display text-base font-semibold tracking-tight sm:text-lg">
                <span className="truncate">{match.name}</span>
                {match.verified ? (
                  <BadgeCheck
                    className="h-4 w-4 shrink-0 fill-leaf text-card"
                    aria-label={t("trustBadges.approved")}
                  />
                ) : null}
              </h3>
              {meta ? (
                <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
                  {meta}
                </p>
              ) : null}
            </button>
            <div className="flex shrink-0 items-center gap-1">
              <CompatibilityRing score={match.score} size="sm" />
              <ReportBlockMenu
                userId={match.userId as string}
                userName={match.name}
                compact
              />
            </div>
          </div>

          <ProfileFactChips
            facts={facts}
            max={4}
            className="mt-2"
            chipClassName="bg-muted/80 border-transparent"
          />

          {match.bio ? (
            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">
              {match.bio}
            </p>
          ) : null}

          <div className="mt-auto flex items-center gap-2 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => onAction("pass")}
              disabled={busy}
            >
              {t("matchesPage.pass")}
            </Button>
            <Button
              type="button"
              size="sm"
              className="flex-1"
              onClick={() => onAction("like")}
              disabled={busy || match.liked}
            >
              <Heart className="h-3.5 w-3.5 fill-current" />
              {t("matchesPage.like")}
            </Button>
          </div>
        </div>
      </div>
    </motion.article>
  );
}
