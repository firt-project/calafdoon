"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Film, Trash2 } from "lucide-react";
import { apiClient } from "@/data/api-client";
import { Button } from "@/components/ui/button";
import { getSafeUserError } from "@/lib/safe-error";
import { readVideoDuration, tusUpload, UploadCancelled, type TusCredentials } from "@/lib/bunny-tus";
import { ProfileVideoPlayer } from "@/components/profile/profile-video-player";

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

type AuthResponse = TusCredentials & { resumed: boolean };

function mimeFor(file: File): string {
  if (file.type) return file.type.toLowerCase();
  return file.name.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4";
}

/** One 30-second profile video: upload (resumable, direct to Bunny), processing, replace, delete. */
export function ProfileVideoCard({ userId }: { userId: string }) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [uploading, setUploading] = useState(false);
  const [percent, setPercent] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resumeRef = useRef<{ videoId: string; url: string } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await apiClient.get<StatusResponse>("/profile-video/status"));
    } catch (e) {
      setInlineError(getSafeUserError(e, "Could not load your video."));
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void apiClient
      .get<StatusResponse>("/profile-video/status")
      .then((s) => alive && setStatus(s))
      .catch((e) => alive && setInlineError(getSafeUserError(e, "Could not load your video.")));
    return () => {
      alive = false;
    };
  }, []);

  const processing = status?.pending?.status === "processing";
  useEffect(() => {
    if (!processing) return;
    const t = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(t);
  }, [processing, load]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const startUpload = async (file: File) => {
    if (uploading) return;
    setInlineError(null);
    const limits = status ?? {
      maxBytes: 150 * 1024 * 1024,
      maxDurationSec: 30,
      allowedTypes: ["video/mp4", "video/quicktime"],
    };
    const type = mimeFor(file);
    if (!limits.allowedTypes.includes(type)) {
      setInlineError("Please choose an MP4 or MOV video.");
      return;
    }
    if (file.size > limits.maxBytes) {
      setInlineError(`That video is too large (max ${Math.round(limits.maxBytes / 1024 / 1024)} MB).`);
      return;
    }
    const duration = await readVideoDuration(file);
    if (duration !== null && duration > limits.maxDurationSec + 0.05) {
      setInlineError(
        `Your video is ${Math.round(duration)} seconds. Please choose one that is ${limits.maxDurationSec} seconds or shorter.`
      );
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
      toast.success("Video uploaded. We are processing it now.");
      await load();
    } catch (e) {
      if (e instanceof UploadCancelled) {
        toast.message("Upload cancelled.");
      } else if (e instanceof Error && /HTTP|chunk|resume|create|authorization/i.test(e.message)) {
        setInlineError(
          "The upload was interrupted. Check your connection and choose the video again — it will continue where it stopped."
        );
      } else {
        setInlineError(getSafeUserError(e, "Upload failed. Please try again."));
      }
      await load();
    } finally {
      setUploading(false);
      abortRef.current = null;
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await apiClient.delete("/profile-video");
      resumeRef.current = null;
      toast.success("Video removed.");
      setConfirmDelete(false);
      await load();
    } catch (e) {
      toast.error(getSafeUserError(e, "Could not remove the video."));
    } finally {
      setBusy(false);
    }
  };

  if (status && !status.configured) return null;
  const maxSec = status?.maxDurationSec ?? 30;
  const hasActive = Boolean(status?.active);
  const pending = status?.pending ?? null;
  const locked = uploading || pending?.status === "processing";

  return (
    <div className="rounded-2xl border border-border p-4 space-y-3">
      <div>
        <h3 className="font-semibold">Profile video</h3>
        <p className="text-sm text-muted-foreground">
          Add one short video (up to {maxSec} seconds) so people can see the real you. MP4 or MOV.
        </p>
      </div>

      {inlineError && (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {inlineError}
        </p>
      )}
      {!inlineError && !uploading && !pending && status?.lastFailure && (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {status.lastFailure.reason}
        </p>
      )}

      {uploading && (
        <div className="space-y-2" aria-live="polite">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-sm text-muted-foreground">Uploading… {percent}%. Keep this page open.</p>
          <Button variant="outline" size="sm" onClick={() => abortRef.current?.abort()}>
            Cancel
          </Button>
        </div>
      )}

      {!uploading && pending?.status === "processing" && (
        <p className="text-sm" aria-live="polite">
          <strong>Processing your video…</strong> {pending.progress > 0 ? `${pending.progress}%` : ""}
          <span className="block text-muted-foreground">
            It will appear on your profile as soon as it is ready. You can leave this page.
          </span>
        </p>
      )}

      {hasActive && <ProfileVideoPlayer ownerUserId={userId} canReport={false} />}

      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,.mp4,.mov"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void startUpload(file);
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={locked} onClick={() => inputRef.current?.click()}>
          <Film className="mr-2 h-4 w-4" /> {hasActive ? "Replace video" : "Choose video"}
        </Button>
        {hasActive && !confirmDelete && (
          <Button variant="outline" size="sm" disabled={locked || busy} onClick={() => setConfirmDelete(true)}>
            <Trash2 className="mr-2 h-4 w-4" /> Remove
          </Button>
        )}
        {confirmDelete && (
          <>
            <Button variant="destructive" size="sm" disabled={busy} onClick={() => void remove()}>
              {busy ? "Removing…" : "Yes, remove it"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
