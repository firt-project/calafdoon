import { useState } from "react";
import { ExternalLink, Flag, Play } from "lucide-react";
import { Browser } from "@capacitor/browser";
import { apiClient, moderation } from "@hel/api-client";
import { userFacingError } from "@/platform/errors";

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
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<Playback>(
        playbackPath ?? `/profile-video/${encodeURIComponent(ownerUserId)}/playback`
      );
      const url = new URL(res.url);
      url.searchParams.set("autoplay", "true");
      setSrc(url.toString());
    } catch (e) {
      setError(userFacingError(e));
    } finally {
      setLoading(false);
    }
  }

  async function report() {
    try {
      await moderation.reportUser({
        userId: ownerUserId,
        reason: "inappropriate",
        details: `Profile video of ${ownerName ?? "member"}`,
      });
      setReported(true);
    } catch (e) {
      setError(userFacingError(e));
    }
  }

  const frameStyle = {
    width: "min(100%, calc(60vh * 9 / 16))",
    aspectRatio: "9 / 16",
    margin: "0 auto",
    borderRadius: "1rem",
    overflow: "hidden",
    background: "#000",
  } as const;

  return (
    <div className="stack" style={{ gap: "0.5rem" }}>
      {src ? (
        <div style={frameStyle}>
          <iframe
            src={src}
            title="Profile video"
            loading="lazy"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            style={{ width: "100%", height: "100%", border: 0, display: "block" }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Play profile video"
          style={{
            ...frameStyle,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: "0.4rem",
            border: 0,
            color: "#fff",
            background: "linear-gradient(160deg, #1f4437, #2e5e4e)",
            maxHeight: "16rem",
            aspectRatio: "16 / 9",
          }}
        >
          <Play size={34} />
          <span>{loading ? "Loading…" : "Watch video"}</span>
        </button>
      )}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {src && (
        <div style={{ display: "flex", justifyContent: "center", gap: "1rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="linkish"
            style={{ display: "inline-flex", gap: "0.3rem", alignItems: "center" }}
            onClick={() => void Browser.open({ url: src })}
          >
            <ExternalLink size={14} /> Open in browser
          </button>
        </div>
      )}
      {canReport && (
        <button
          type="button"
          className="linkish"
          disabled={reported}
          onClick={() => void report()}
          style={{ alignSelf: "center", display: "inline-flex", gap: "0.3rem", alignItems: "center" }}
        >
          <Flag size={14} /> {reported ? "Reported — thank you" : "Report this video"}
        </button>
      )}
    </div>
  );
}
