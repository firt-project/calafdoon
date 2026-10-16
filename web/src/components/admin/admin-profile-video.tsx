"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiClient } from "@/data/api-client";
import { Button } from "@/components/ui/button";
import { getSafeUserError } from "@/lib/safe-error";
import { ProfileVideoPlayer } from "@/components/profile/profile-video-player";

/** Staff view of a member's profile video, with removal for moderation. */
export function AdminProfileVideo({ userId }: { userId: string }) {
  const [state, setState] = useState<"loading" | "none" | "has" | "removed">("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void apiClient
      .get<{ active: unknown | null }>(`/admin/profile-video/${encodeURIComponent(userId)}`)
      .then((r) => alive && setState(r?.active ? "has" : "none"))
      .catch(() => alive && setState("none"));
    return () => {
      alive = false;
    };
  }, [userId]);

  const remove = async () => {
    if (!window.confirm("Remove this member's profile video? This cannot be undone.")) return;
    setBusy(true);
    try {
      await apiClient.delete(`/admin/profile-video/${encodeURIComponent(userId)}`);
      toast.success("Video removed.");
      setState("removed");
    } catch (e) {
      toast.error(getSafeUserError(e, "Could not remove the video."));
    } finally {
      setBusy(false);
    }
  };

  if (state === "loading") return null;
  if (state === "none") return <p className="text-sm text-muted-foreground">No profile video.</p>;
  if (state === "removed") return <p className="text-sm text-muted-foreground">Video removed.</p>;
  return (
    <div className="space-y-3">
      <ProfileVideoPlayer
        ownerUserId={userId}
        canReport={false}
        playbackPath={`/admin/profile-video/${encodeURIComponent(userId)}/playback`}
      />
      <Button variant="destructive" size="sm" disabled={busy} onClick={() => void remove()}>
        Remove this video
      </Button>
    </div>
  );
}
