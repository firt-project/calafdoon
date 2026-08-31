"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  MapPin,
  GraduationCap,
  Briefcase,
  CalendarHeart,
  Baby,
  Heart,
  Ruler,
  Sparkles,
  Languages,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LazyImage } from "@/components/ui/lazy-image";
import { OnlineBadge } from "@/components/ui/online-status";
import { TrustBadges } from "@/components/profile/trust-badges";
import { PhotoGalleryLightbox } from "@/components/ui/photo-gallery-lightbox";
import { apiChat } from "@/data/chat/api";
import { usePresence } from "@/data/presence/hooks";
import { useTranslation } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import type { ConversationPartnerProfile } from "@/types";

type ChatPartnerProfileModalProps = {
  profile: ConversationPartnerProfile;
  conversationId?: string | null;
  score?: number | null;
  open: boolean;
  onClose: () => void;
};

function text(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim();
  if (value == null) return fallback;
  return String(value);
}

function isPartnerProfile(value: unknown): value is ConversationPartnerProfile {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as ConversationPartnerProfile).userId === "string" &&
    typeof (value as ConversationPartnerProfile).name === "string"
  );
}

export function ChatPartnerProfileModal({
  profile: seedProfile,
  conversationId,
  score: seedScore,
  open,
  onClose,
}: ChatPartnerProfileModalProps) {
  const [mounted, setMounted] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [profile, setProfile] = useState(seedProfile);
  const [score, setScore] = useState(seedScore);
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();
  const { isOnline, seed } = usePresence();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    setProfile(seedProfile);
    setScore(seedScore);
    seed([{ userId: seedProfile.userId, isOnline: seedProfile.isOnline }]);
  }, [open, seedProfile, seedScore, seed]);

  useEffect(() => {
    if (!open || !conversationId) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await apiChat.getPartnerProfile(conversationId);
        if (cancelled) return;
        if (isPartnerProfile(res?.profile)) {
          setProfile(res.profile);
          seed([
            { userId: res.profile.userId, isOnline: res.profile.isOnline },
          ]);
        }
        if (typeof res?.score === "number") {
          setScore(res.score);
        }
      } catch {
        // Keep seed profile from the conversation list.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, conversationId, seed]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const online = isOnline(profile.userId, !!profile.isOnline);

  if (!mounted || !open) return null;

  const name = text(profile.name, t("chatPage.match"));
  const age = typeof profile.age === "number" && profile.age > 0 ? profile.age : null;
  const location = [text(profile.city), text(profile.country)]
    .filter(Boolean)
    .join(", ");
  const mainPhoto =
    typeof profile.imageUrl === "string" && profile.imageUrl.length > 0
      ? profile.imageUrl
      : null;
  const extras = (profile.additionalImageUrls ?? []).filter(Boolean);
  const gallery = [mainPhoto, ...extras].filter(
    (u): u is string => typeof u === "string" && u.length > 0
  );
  const matchScore = typeof score === "number" ? Math.round(score) : null;

  const facts: Array<{
    label: string;
    value: string;
    icon?: React.ReactNode;
  }> = [
    profile.religiousLevel
      ? {
          label: t("matchesPage.religion"),
          value: text(profile.religiousLevel),
          icon: <Sparkles className="h-3.5 w-3.5" />,
        }
      : null,
    profile.prayerFrequency
      ? {
          label: t("profilePage.prayerFrequency"),
          value: text(profile.prayerFrequency),
        }
      : null,
    profile.maritalStatus
      ? {
          label: t("matchesPage.maritalStatus"),
          value: text(profile.maritalStatus),
        }
      : null,
    profile.marriageTimeline
      ? {
          label: t("matchesPage.marriageTimeline"),
          value: text(profile.marriageTimeline),
          icon: <CalendarHeart className="h-3.5 w-3.5" />,
        }
      : null,
    profile.wantChildren
      ? {
          label: t("matchesPage.wantChildren"),
          value: text(profile.wantChildren),
          icon: <Baby className="h-3.5 w-3.5" />,
        }
      : null,
    profile.education
      ? {
          label: t("matchesPage.education"),
          value: text(profile.education),
          icon: <GraduationCap className="h-3.5 w-3.5" />,
        }
      : null,
    profile.occupation
      ? {
          label: t("matchesPage.occupation"),
          value: text(profile.occupation),
          icon: <Briefcase className="h-3.5 w-3.5" />,
        }
      : null,
    typeof profile.height === "number" && profile.height > 0
      ? {
          label: t("matchesPage.height"),
          value: `${profile.height} cm`,
          icon: <Ruler className="h-3.5 w-3.5" />,
        }
      : null,
  ].filter(Boolean) as Array<{
    label: string;
    value: string;
    icon?: React.ReactNode;
  }>;

  const languages = (profile.languagesSpoken ?? []).filter(Boolean);
  const qualities = (profile.qualities ?? []).filter(Boolean);
  const hobbies = (profile.hobbies ?? []).filter(Boolean);
  const hasDetails =
    !!location ||
    !!text(profile.bio) ||
    facts.length > 0 ||
    languages.length > 0 ||
    qualities.length > 0 ||
    hobbies.length > 0 ||
    age != null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center sm:p-4"
      role="presentation"
    >
      <button
        type="button"
        aria-label={t("common.a11yClose")}
        className="absolute inset-0 bg-[#1a1214]/55 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-partner-profile-title"
        className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl sm:rounded-3xl"
      >
        <div className="relative h-56 shrink-0 overflow-hidden bg-gradient-to-br from-primary/20 via-accent to-muted sm:h-64">
          {mainPhoto ? (
            <button
              type="button"
              className="h-full w-full"
              onClick={() => {
                setGalleryIndex(0);
                setGalleryOpen(true);
              }}
              aria-label={t("chatPage.viewPhotos")}
            >
              <LazyImage
                src={mainPhoto}
                alt={name}
                className="h-full w-full object-cover"
              />
            </button>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2">
              <Avatar className="h-24 w-24 ring-4 ring-background/40">
                <AvatarFallback className="text-3xl font-semibold">
                  {name.charAt(0) || "?"}
                </AvatarFallback>
              </Avatar>
              {profile.photoHidden ? (
                <p className="px-6 text-center text-xs text-muted-foreground">
                  {t("matchesPage.photoPrivate")}
                </p>
              ) : null}
            </div>
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-card via-card/70 to-transparent" />

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-3 top-3 h-9 w-9 rounded-full bg-black/35 text-white hover:bg-black/50 hover:text-white"
            onClick={onClose}
            aria-label={t("common.a11yClose")}
          >
            <X className="h-4 w-4" />
          </Button>

          <div className="absolute left-3 top-3">
            <OnlineBadge online={online} label={t("matchesPage.online")} />
          </div>

          {matchScore != null ? (
            <Badge className="absolute bottom-4 right-4 border-0 bg-primary px-3 py-1 text-sm font-bold text-primary-foreground shadow-lg">
              <Heart className="mr-1.5 h-3.5 w-3.5 fill-current" />
              {t("matchesPage.matchPercent", { score: matchScore })}
            </Badge>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-2 space-y-5">
          <div>
            <h2
              id="chat-partner-profile-title"
              className="text-2xl font-bold tracking-tight"
            >
              {name}
              {age != null ? (
                <span className="font-semibold text-muted-foreground">
                  , {age}
                </span>
              ) : null}
            </h2>
            {location ? (
              <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 shrink-0 text-primary/80" />
                {location}
              </p>
            ) : null}
            <OnlineBadge
              online={online}
              label={t("matchesPage.online")}
              variant="text"
            />
            <TrustBadges profile={profile} size="sm" className="mt-3" />
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("chatPage.profileLoading")}
            </div>
          ) : null}

          {!loading && extras.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {gallery.map((url, i) => (
                <button
                  key={`${url}-${i}`}
                  type="button"
                  onClick={() => {
                    setGalleryIndex(i);
                    setGalleryOpen(true);
                  }}
                  className={cn(
                    "relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border",
                    i === 0 && "ring-2 ring-primary/40"
                  )}
                >
                  <LazyImage
                    src={url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          ) : null}

          {!loading && text(profile.bio) ? (
            <section className="rounded-2xl border border-border/80 bg-muted/40 p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {t("matchesPage.about")}
              </p>
              <p className="text-sm leading-relaxed text-foreground/90">
                {text(profile.bio)}
              </p>
            </section>
          ) : null}

          {!loading && facts.length > 0 ? (
            <section className="grid grid-cols-2 gap-2.5">
              {facts.map((fact) => (
                <div
                  key={fact.label}
                  className="rounded-2xl border border-border/70 bg-background/60 p-3"
                >
                  <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                    {fact.icon}
                    {fact.label}
                  </p>
                  <p className="mt-1 text-sm font-semibold leading-snug">
                    {fact.value}
                  </p>
                </div>
              ))}
            </section>
          ) : null}

          {!loading && languages.length > 0 ? (
            <ChipSection
              title={t("chatPage.languages")}
              icon={<Languages className="h-3.5 w-3.5" />}
              items={languages}
            />
          ) : null}
          {!loading && qualities.length > 0 ? (
            <ChipSection
              title={t("profilePage.qualities")}
              items={qualities}
            />
          ) : null}
          {!loading && hobbies.length > 0 ? (
            <ChipSection title={t("profilePage.hobbies")} items={hobbies} />
          ) : null}

          {!loading && !hasDetails ? (
            <p className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-5 text-center text-sm text-muted-foreground">
              {t("chatPage.profileDetailsLimited")}
            </p>
          ) : null}

          <p className="text-center text-[11px] text-muted-foreground">
            {t("chatPage.profilePrivacyNote")}
          </p>
        </div>
      </div>

      <PhotoGalleryLightbox
        images={gallery}
        initialIndex={galleryIndex}
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        alt={name}
      />
    </div>,
    document.body
  );
}

function ChipSection({
  title,
  items,
  icon,
}: {
  title: string;
  items: string[];
  icon?: React.ReactNode;
}) {
  return (
    <section>
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {icon}
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item}
            className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium"
          >
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}
