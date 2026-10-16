import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Film, Trash2 } from "lucide-react";
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
  const recordRef = useRef<HTMLInputElement | null>(null);

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
    try {
      const creds = await apiClient.post<AuthResponse>("/profile-video/upload-auth", {
        contentType: type,
        sizeBytes: file.size,
        ...(duration !== null ? { durationSec: Math.round(duration * 10) / 10 } : {}),
      });
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
      await apiClient.post("/profile-video/confirm", {});
      await hapticSuccess();
      setNotice("Video uploaded. We are processing it now.");
      await load();
    } catch (e) {
      if (e instanceof UploadCancelled) {
        setNotice("Upload cancelled.");
      } else {
        await hapticError();
        setError(
          e instanceof Error && /HTTP|chunk|resume|create|authorization/i.test(e.message)
            ? "The upload was interrupted. Check your connection and tap the button to try again — it will pick up where it stopped."
            : userFacingError(e)
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

  return (
    <section className="surface-card feed-section" aria-label="Profile video">
      <div className="feed-section-head">
        <div>
          <h2>Profile video</h2>
          <p className="muted small">
            Add one short video (up to {maxSec} seconds) so people can see the real you. MP4 or MOV.
          </p>
        </div>
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

      {uploading && (
        <div className="stack" aria-live="polite">
          <div style={{ height: 8, borderRadius: 999, background: "var(--muted)", overflow: "hidden" }}>
            <div style={{ width: `${percent}%`, height: "100%", background: "var(--primary, #2e5e4e)", transition: "width 0.2s" }} />
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            Uploading… {percent}%. Keep the app open.
          </p>
          <button type="button" className="btn btn-secondary" onClick={() => abortRef.current?.abort()}>
            Cancel
          </button>
        </div>
      )}

      {!uploading && pending?.status === "processing" && (
        <div className="stack" aria-live="polite">
          <p style={{ margin: 0 }}>
            <strong>Processing your video…</strong> {pending.progress > 0 ? `${pending.progress}%` : ""}
          </p>
          <p className="muted small" style={{ margin: 0 }}>
            It will appear on your profile as soon as it is ready. You can leave this screen.
          </p>
        </div>
      )}

      {hasActive && user?.id && (
        <div className="stack">
          <ProfileVideoPlayer ownerUserId={String(user.id)} canReport={false} />
        </div>
      )}

      <input ref={pickRef} type="file" accept="video/mp4,video/quicktime,.mp4,.mov" hidden onChange={onPicked} />
      <input ref={recordRef} type="file" accept="video/*" capture="user" hidden onChange={onPicked} />

      <div className="row" style={{ justifyContent: "center", marginTop: "0.75rem", flexWrap: "wrap" }}>
        <button type="button" className="btn btn-secondary" disabled={locked} onClick={() => recordRef.current?.click()}>
          <Camera size={16} /> Record
        </button>
        <button type="button" className="btn btn-secondary" disabled={locked} onClick={() => pickRef.current?.click()}>
          <Film size={16} /> {hasActive ? "Replace video" : "Choose video"}
        </button>
        {hasActive && (
          <button type="button" className="btn btn-secondary" disabled={locked || busy} onClick={() => setConfirmDelete(true)}>
            <Trash2 size={16} /> Remove
          </button>
        )}
      </div>

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
