"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Flag, Play } from "lucide-react";
import { apiClient } from "@/data/api-client";
import { getSafeUserError } from "@/lib/safe-error";

type Playback = { url: string; expiresAt: number; durationSec: number | null };

/**
 * Lazy profile-video player: nothing is requested or downloaded until the viewer taps
 * play. Playback authorization (and the signed embed URL) comes from our API.
 */
export function ProfileVideoPlayer({
  ownerUserId,
  ownerName,
  canReport = true,
  playbackPath,
}: {
  ownerUserId: string;
  ownerName?: string;
  canReport?: boolean;
  /** Override for staff previews. */
  playbackPath?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reported, setReported] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<Playback>(
        playbackPath ?? `/profile-video/${encodeURIComponent(ownerUserId)}/playback`
      );
      const url = new URL(res.url);
      url.searchParams.set("autoplay", "true");
      setSrc(url.toString());
    } catch (e) {
      toast.error(getSafeUserError(e, "This video is not available."));
    } finally {
      setLoading(false);
    }
  };

  const report = async () => {
    try {
      await apiClient.post("/moderation/report", {
        userId: ownerUserId,
        reason: "inappropriate",
        details: `Profile video of ${ownerName ?? "member"}`,
      });
      setReported(true);
      toast.success("Reported. Thank you.");
    } catch (e) {
      toast.error(getSafeUserError(e, "Could not send the report."));
    }
  };

  return (
    <div className="space-y-2">
      <div className="mx-auto aspect-[9/16] max-h-[60vh] w-full max-w-[24rem] overflow-hidden rounded-2xl bg-black">
        {src ? (
          <iframe
            src={src}
            title="Profile video"
            loading="lazy"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="h-full w-full border-0"
          />
        ) : (
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Play profile video"
            className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-emerald-900 to-emerald-700 text-white"
          >
            <Play className="h-9 w-9" />
            <span>{loading ? "Loading…" : "Watch video"}</span>
          </button>
        )}
      </div>
      {canReport && (
        <button
          type="button"
          disabled={reported}
          onClick={() => void report()}
          className="mx-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
        >
          <Flag className="h-3.5 w-3.5" /> {reported ? "Reported — thank you" : "Report this video"}
        </button>
      )}
    </div>
  );
}
