"use client";

import { useState } from "react";
import { Eye, Lock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  usePrivateRevealStatus,
  useRevealPrivatePhoto,
} from "@/data/matching/hooks";
import { useTranslation } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { LazyImage } from "@/components/ui/lazy-image";
import { PhotoGalleryLightbox } from "@/components/ui/photo-gallery-lightbox";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type RevealStatus = {
  hasPrivatePhotos?: boolean;
  canReveal?: boolean;
  remainingReveals?: number;
  unreaveledCount?: number;
  privatePhotoCount?: number;
  revealed?: Array<{ mediaId: string; url: string | null; revealedAt?: string }>;
};

export function PrivatePhotoRevealCard({
  matchId,
  partnerName,
  className,
}: {
  matchId?: string | null;
  partnerName?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const enabled = !!matchId;
  const { data, refresh } = usePrivateRevealStatus(
    matchId ?? undefined,
    enabled
  );
  const reveal = useRevealPrivatePhoto();
  const [busy, setBusy] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  if (!matchId) return null;
  if (data === undefined) {
    return <Skeleton className={cn("h-28 w-full rounded-2xl", className)} />;
  }

  const status = (data ?? {}) as RevealStatus;
  if (!status.hasPrivatePhotos && (status.revealed?.length ?? 0) === 0) {
    return null;
  }

  const revealedUrls = (status.revealed ?? [])
    .map((r) => r.url)
    .filter((u): u is string => typeof u === "string" && u.length > 0);

  const onReveal = async () => {
    setBusy(true);
    try {
      await reveal(matchId);
      toast.success(t("privateReveal.revealedToast"));
      refresh();
    } catch {
      toast.error(t("privateReveal.errorToast"));
    } finally {
      setBusy(false);
    }
  };

  const name = partnerName?.split(" ")[0] || t("privateReveal.someone");

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/80 bg-card p-4 space-y-3 shadow-sm",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Lock className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t("privateReveal.title")}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {status.canReveal
              ? t("privateReveal.availableDesc", {
                  name,
                  count: status.unreaveledCount ?? 1,
                  remaining: status.remainingReveals ?? 0,
                })
              : revealedUrls.length > 0
                ? t("privateReveal.unlockedDesc", { name })
                : t("privateReveal.usedUpDesc")}
          </p>
        </div>
      </div>

      {revealedUrls.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {revealedUrls.map((url, index) => (
            <button
              key={url}
              type="button"
              className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-muted"
              onClick={() => {
                setLightboxIndex(index);
                setLightboxOpen(true);
              }}
            >
              <LazyImage src={url} alt="" className="h-full w-full object-cover" />
              <span className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity">
                <Eye className="h-4 w-4 text-white" />
              </span>
            </button>
          ))}
        </div>
      )}

      {status.canReveal && (
        <Button
          type="button"
          className="w-full rounded-full"
          disabled={busy}
          onClick={() => void onReveal()}
        >
          <Sparkles className="h-4 w-4 mr-2" />
          {busy
            ? t("privateReveal.revealing")
            : t("privateReveal.revealCta", {
                remaining: status.remainingReveals ?? 1,
              })}
        </Button>
      )}

      {!status.canReveal &&
        revealedUrls.length === 0 &&
        (status.privatePhotoCount ?? 0) > 0 && (
          <p className="text-xs text-muted-foreground text-center">
            {t("privateReveal.noCreditsLeft")}
          </p>
        )}

      {revealedUrls.length > 0 && (
        <PhotoGalleryLightbox
          images={revealedUrls}
          initialIndex={lightboxIndex}
          open={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          alt={name}
        />
      )}
    </div>
  );
}
