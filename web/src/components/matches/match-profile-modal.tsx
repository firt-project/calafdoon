"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Heart,
  Star,
  ArrowLeft,
  BadgeCheck,
  ChevronRight,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LazyImage } from "@/components/ui/lazy-image";
import { OnlineBadge } from "@/components/ui/online-status";
import { PhotoGalleryLightbox } from "@/components/ui/photo-gallery-lightbox";
import { ReportBlockMenu } from "@/components/safety/report-block-menu";
import { MatchViewErrorBoundary } from "@/components/matches/match-view-error-boundary";
import {
  buildProfileFacts,
  ProfileFactChips,
  ValueChips,
} from "@/components/matches/profile-fact-chips";
import { useTranslation } from "@/lib/i18n/context";
import { usePresence } from "@/data/presence/hooks";
import { cn } from "@/lib/utils";

type MatchLike = {
  userId: string;
  name?: string | null;
  age?: number | null;
  country?: string | null;
  city?: string | null;
  height?: number | null;
  education?: string | null;
  occupation?: string | null;
  religiousLevel?: string | null;
  prayerFrequency?: string | null;
  bio?: string | null;
  maritalStatus?: string | null;
  marriageTimeline?: string | null;
  wantChildren?: string | null;
  imageUrl?: string | null;
  additionalImageUrls?: string[];
  photoHidden?: boolean;
  score?: number | null;
  shortlisted?: boolean;
  liked?: boolean;
  verified?: boolean;
  isOnline?: boolean;
  qualities?: string[];
  hobbies?: string[];
};

interface MatchProfileModalProps {
  match: MatchLike;
  isPremium: boolean;
  busy?: boolean;
  onClose: () => void;
  onLike: (action: "like" | "pass" | "shortlist") => void;
  onMessage?: () => void;
}

function text(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value == null) return fallback;
  return String(value);
}

export function MatchProfileModal({
  match,
  onClose,
  onLike,
  busy = false,
}: MatchProfileModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return createPortal(
    <MatchViewErrorBoundary onClose={onClose} title="Could not open this profile">
      <MatchProfileModalBody
        match={match}
        onClose={onClose}
        onLike={onLike}
        busy={busy}
      />
    </MatchViewErrorBoundary>,
    document.body
  );
}

function MatchProfileModalBody({
  match,
  onClose,
  onLike,
  busy = false,
}: Omit<MatchProfileModalProps, "isPremium" | "onMessage">) {
  const { t } = useTranslation();
  const { isOnline, seed } = usePresence();
  const online = isOnline(match.userId, !!match.isOnline);
  const [bioExpanded, setBioExpanded] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);

  const name = text(match.name, "Member");
  const age = typeof match.age === "number" ? match.age : null;
  const location = [text(match.city), text(match.country)].filter(Boolean).join(", ");
  const meta = [age, location].filter(Boolean).join(" • ");
  const bio = text(match.bio);
  const facts = buildProfileFacts(match);
  const values = useMemo(() => {
    const q = Array.isArray(match.qualities) ? match.qualities : [];
    const h = Array.isArray(match.hobbies) ? match.hobbies : [];
    return [...q, ...h].filter(Boolean).slice(0, 8);
  }, [match.qualities, match.hobbies]);

  const photos = useMemo(() => {
    const main =
      typeof match.imageUrl === "string" && match.imageUrl.length > 0
        ? match.imageUrl
        : null;
    const extra = Array.isArray(match.additionalImageUrls)
      ? match.additionalImageUrls
      : [];
    return [main, ...extra].filter(
      (url): url is string => typeof url === "string" && url.length > 0
    );
  }, [match.imageUrl, match.additionalImageUrls]);

  useEffect(() => {
    seed([{ userId: match.userId, isOnline: match.isOnline }]);
  }, [match.userId, match.isOnline, seed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/45 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={name}
    >
      <button
        type="button"
        className="absolute inset-0"
        aria-label={t("common.a11yClose")}
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[94dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-border bg-background shadow-2xl sm:rounded-3xl">
        <header className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"
            aria-label={t("common.a11yClose")}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <p className="font-display text-lg font-semibold text-primary tracking-tight">
            Hel Calafkaaga
          </p>
          <ReportBlockMenu
            userId={match.userId}
            userName={name}
            compact
          />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-28 pt-4 space-y-5">
          <div className="flex gap-4">
            <div className="relative h-24 w-24 shrink-0 sm:h-28 sm:w-28">
              {photos[0] ? (
                <button
                  type="button"
                  className="h-full w-full overflow-hidden rounded-full ring-2 ring-border"
                  onClick={() => {
                    setGalleryIndex(0);
                    setGalleryOpen(true);
                  }}
                >
                  <LazyImage
                    src={photos[0]}
                    alt={name}
                    className="h-full w-full object-cover"
                  />
                </button>
              ) : (
                <Avatar className="h-full w-full">
                  <AvatarFallback className="text-3xl font-display">
                    {name.charAt(0) || "?"}
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
            <div className="min-w-0 flex-1 pt-1">
              <h2 className="flex items-center gap-1.5 text-xl font-bold tracking-tight">
                <span className="truncate">{name}</span>
                {match.verified ? (
                  <BadgeCheck
                    className="h-5 w-5 shrink-0 fill-emerald-500 text-white"
                    aria-label={t("trustBadges.approved")}
                  />
                ) : null}
              </h2>
              {meta ? (
                <p className="mt-1 text-sm text-muted-foreground">{meta}</p>
              ) : null}
              <OnlineBadge
                online={online}
                label={t("matchesPage.online")}
                variant="text"
                className="mt-1.5"
              />
            </div>
          </div>

          <ProfileFactChips facts={facts} chipClassName="border-primary/30 bg-card px-2.5 py-1.5 text-xs" />

          {bio ? (
            <section className="rounded-2xl bg-muted/70 p-4">
              <h3 className="text-sm font-semibold text-primary">
                {t("matchesPage.aboutMe")}
              </h3>
              <p
                className={cn(
                  "mt-2 text-sm leading-relaxed text-foreground/90",
                  !bioExpanded && "line-clamp-3"
                )}
              >
                {bio}
              </p>
              {bio.length > 120 ? (
                <button
                  type="button"
                  className="mt-2 inline-flex items-center gap-0.5 text-sm font-semibold text-primary"
                  onClick={() => setBioExpanded((v) => !v)}
                >
                  {bioExpanded
                    ? t("matchesPage.readLess")
                    : t("matchesPage.readMore")}
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 transition-transform",
                      bioExpanded && "rotate-90"
                    )}
                  />
                </button>
              ) : null}
            </section>
          ) : null}

          {photos.length > 0 ? (
            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  {t("matchesPage.photosCount", { count: photos.length })}
                </h3>
                <button
                  type="button"
                  className="text-sm font-semibold text-primary"
                  onClick={() => {
                    setGalleryIndex(0);
                    setGalleryOpen(true);
                  }}
                >
                  {t("matchesPage.seeAll")}
                </button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {photos.map((url, i) => (
                  <button
                    key={`${url}-${i}`}
                    type="button"
                    className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-muted"
                    onClick={() => {
                      setGalleryIndex(i);
                      setGalleryOpen(true);
                    }}
                  >
                    <LazyImage
                      src={url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </section>
          ) : match.photoHidden ? (
            <p className="text-sm text-muted-foreground">
              {t("matchesPage.photoPrivate")}
            </p>
          ) : null}

          {values.length > 0 ? (
            <section className="rounded-2xl bg-muted/70 p-4">
              <h3 className="text-sm font-semibold">
                {t("matchesPage.myValues")}
              </h3>
              <ValueChips values={values} className="mt-3" />
            </section>
          ) : null}
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center gap-6 bg-gradient-to-t from-background via-background/95 to-transparent px-4 pb-5 pt-10">
          <div className="pointer-events-auto flex flex-col items-center gap-1.5">
            <button
              type="button"
              className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md disabled:opacity-50"
              onClick={() => onLike("pass")}
              disabled={busy}
              aria-label={t("matchesPage.pass")}
            >
              <X className="h-6 w-6" />
            </button>
            <span className="text-xs font-medium text-muted-foreground">
              {t("matchesPage.pass")}
            </span>
          </div>
          <div className="pointer-events-auto flex flex-col items-center gap-1.5">
            <button
              type="button"
              className="flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg disabled:opacity-50"
              onClick={() => onLike("like")}
              disabled={busy || !!match.liked}
              aria-label={t("matchesPage.like")}
            >
              <Heart className="h-7 w-7 fill-current" />
            </button>
            <span className="text-xs font-semibold text-primary">
              {t("matchesPage.like")}
            </span>
          </div>
          <div className="pointer-events-auto flex flex-col items-center gap-1.5">
            <button
              type="button"
              className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md disabled:opacity-50"
              onClick={() => onLike("shortlist")}
              disabled={busy || !!match.shortlisted}
              aria-label={t("matchesPage.superLike")}
            >
              <Star
                className={cn(
                  "h-6 w-6",
                  match.shortlisted && "fill-primary text-primary"
                )}
              />
            </button>
            <span className="text-xs font-medium text-muted-foreground">
              {t("matchesPage.superLike")}
            </span>
          </div>
        </div>
      </div>

      {galleryOpen && photos.length > 0 ? (
        <PhotoGalleryLightbox
          images={photos}
          initialIndex={galleryIndex}
          open={galleryOpen}
          onClose={() => setGalleryOpen(false)}
          alt={name}
        />
      ) : null}
    </div>
  );
}
