import { useCallback, useEffect, useRef, useState } from "react";
import { Film, RefreshCw, Trash2 } from "lucide-react";
import { apiClient } from "@hel/api-client";
import { useSession } from "@/features/auth/SessionProvider";
import { BottomSheet } from "@/ui/mobile-kit";
import { userFacingError } from "@/platform/errors";
import { hapticError, hapticSuccess } from "@/platform/haptics";
import { readVideoDuration, tusUpload, UploadCancelled, type TusCredentials } from "@/platform/bunny-tus";
import { ProfileVideoPlayer } from "@/features/profile/ProfileVideoPlayer";

type View = {
  id: string;
  status: "uploading" | "processing" | "ready" | "failed" | "rejected";
  progress: number;
  durationSec: number | null;
};

type StatusResponse = {
  configured: boolean;
  active: View | null;
  pending: View | null;
  lastFailure: { reason: string } | null;
  maxDurationSec: number;
  maxBytes: number;
  allowedTypes: string[];
};

type AuthResponse = TusCredentials & { resumed: boolean; maxDurationSec: number; maxBytes: number };

function mimeFor(file: File): string {
  if (file.type) return file.type.toLowerCase();
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext === "mov" ? "video/quicktime" : "video/mp4";
}

export function ProfileVideoSection() {
  const { user } = useSession();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [percent, setPercent] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const resumeRef = useRef<{ videoId: string; url: string } | null>(null);
  const pickRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await apiClient.get<StatusResponse>("/profile-video/status"));
    } catch (e) {
      setError(userFacingError(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll while Bunny is processing.
  const processing = status?.pending?.status === "processing";
  useEffect(() => {
    if (!processing) return;
    const t = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(t);
  }, [processing, load]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function startUpload(file: File) {
    if (uploading) return;
    setError(null);
    setNotice(null);
    const limits = status ?? { maxBytes: 150 * 1024 * 1024, maxDurationSec: 30, allowedTypes: ["video/mp4", "video/quicktime"] };
    const type = mimeFor(file);
    if (!limits.allowedTypes.includes(type)) {
      setError("Please choose an MP4 or MOV video.");
      return;
    }
    if (file.size > limits.maxBytes) {
      setError(`That video is too large (max ${Math.round(limits.maxBytes / 1024 / 1024)} MB).`);
      return;
    }
    const duration = await readVideoDuration(file);
    if (duration !== null && duration > limits.maxDurationSec + 0.05) {
      setError(`Your video is ${Math.round(duration)} seconds. Please choose one that is ${limits.maxDurationSec} seconds or shorter.`);
      return;
    }
    const blob = file.type === type ? file : file.slice(0, file.size, type);

    const controller = new AbortController();
    abortRef.current = controller;
    setUploading(true);
    setPercent(0);
    let step = "authorize";
    try {
      const creds = await apiClient.post<AuthResponse>("/profile-video/upload-auth", {
        contentType: type,
        sizeBytes: file.size,
        ...(duration !== null ? { durationSec: Math.round(duration * 10) / 10 } : {}),
      });
      step = "upload";
      const resume = resumeRef.current?.videoId === creds.videoId ? resumeRef.current.url : null;
      await tusUpload(blob, creds, {
        title: "profile-video",
        signal: controller.signal,
        resumeUrl: resume,
        onUrl: (url) => {
          resumeRef.current = { videoId: creds.videoId, url };
        },
        onProgress: (sent, total) => setPercent(Math.round((sent / total) * 100)),
      });
      resumeRef.current = null;
      step = "finish";
      await apiClient.post("/profile-video/confirm", {});
      await hapticSuccess();
      setNotice("Video uploaded. We are processing it now.");
      await load();
    } catch (e) {
      if (e instanceof UploadCancelled) {
        setNotice("Upload cancelled.");
      } else {
        await hapticError();
        const detail =
          e instanceof Error && e.message
            ? e.message
            : userFacingError(e);
        console.error("[profile-video]", step, e);
        setError(
          step === "authorize"
            ? `Could not start the upload: ${detail}`
            : `Upload problem at the ${step} step: ${detail}. Tap Choose video to try again — it continues where it stopped.`
        );
      }
      await load();
    } finally {
      setUploading(false);
      abortRef.current = null;
    }
  }

  function onPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void startUpload(file);
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await apiClient.delete("/profile-video");
      resumeRef.current = null;
      setNotice("Video removed.");
      setConfirmDelete(false);
      await load();
    } catch (e) {
      setError(userFacingError(e));
    } finally {
      setBusy(false);
    }
  }

  if (status && !status.configured) return null;

  const maxSec = status?.maxDurationSec ?? 30;
  const hasActive = Boolean(status?.active);
  const pending = status?.pending ?? null;
  const locked = uploading || pending?.status === "processing";

  const showEmpty = !hasActive && !uploading && pending?.status !== "processing";

  return (
    <section className="surface-card feed-section" aria-label="Profile video">
      <div className="feed-section-head">
        <div>
          <h2>Profile video</h2>
          <p className="muted small">A short clip lets people see the real you.</p>
        </div>
        <span className="ph-count">{maxSec}s max</span>
      </div>

      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {notice && !error && (
        <div className="form-notice" role="status">
          {notice}
        </div>
      )}
      {!error && !uploading && !pending && status?.lastFailure && (
        <div className="form-error" role="alert">
          {status.lastFailure.reason}
        </div>
      )}

      <input ref={pickRef} type="file" accept="video/mp4,video/quicktime,.mp4,.mov" hidden onChange={onPicked} />

      {showEmpty && (
        <button type="button" className="ph-empty" disabled={locked} onClick={() => pickRef.current?.click()}>
          <span className="ph-empty-icon">
            <Film size={30} aria-hidden />
          </span>
          <strong>Add a {maxSec}-second video</strong>
          <span className="muted small">MP4 or MOV · say hello, show your smile</span>
        </button>
      )}

      {uploading && (
        <div className="pv-card" aria-live="polite">
          <div className="pv-row">
            <strong>Uploading your video</strong>
            <span className="ph-count">{percent}%</span>
          </div>
          <div className="pv-bar" aria-hidden>
            <div style={{ width: `${percent}%` }} />
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            Keep the app open until it finishes.
          </p>
          <button type="button" className="btn btn-secondary btn-block" onClick={() => abortRef.current?.abort()}>
            Cancel upload
          </button>
        </div>
      )}

      {!uploading && pending?.status === "processing" && (
        <div className="pv-card" aria-live="polite">
          <div className="pv-row">
            <strong>Preparing your video…</strong>
            <span className="ph-count">{pending.progress > 0 ? `${pending.progress}%` : "…"}</span>
          </div>
          <div className="pv-bar" aria-hidden>
            <div style={{ width: `${Math.max(6, pending.progress)}%` }} />
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            It appears on your profile as soon as it is ready. You can leave this screen.
          </p>
        </div>
      )}

      {hasActive && user?.id && (
        <div className="pv-player">
          <ProfileVideoPlayer ownerUserId={String(user.id)} canReport={false} />
        </div>
      )}

      {(hasActive || pending) && (
        <div className="ph-actions pv-actions">
          {hasActive && (
            <button type="button" className="ph-btn" disabled={locked} onClick={() => pickRef.current?.click()}>
              <RefreshCw size={16} aria-hidden /> Replace
            </button>
          )}
          <button type="button" className="ph-btn danger" disabled={uploading || busy} onClick={() => setConfirmDelete(true)}>
            <Trash2 size={16} aria-hidden /> Remove
          </button>
        </div>
      )}

      <BottomSheet open={confirmDelete} title="Remove your video?" onClose={() => setConfirmDelete(false)}>
        <div className="stack">
          <p className="muted small" style={{ margin: 0 }}>
            Your profile video will be deleted. You can upload a new one any time.
          </p>
          <button type="button" className="btn btn-danger btn-block" disabled={busy} onClick={() => void remove()}>
            {busy ? "Removing…" : "Remove video"}
          </button>
          <button type="button" className="btn btn-secondary btn-block" onClick={() => setConfirmDelete(false)}>
            Cancel
          </button>
        </div>
      </BottomSheet>
    </section>
  );
}
