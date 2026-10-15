import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, Camera } from "lucide-react";
import { apiClient, prepareImageForUpload } from "@hel/api-client";
import { BottomSheet, EmptyState, SkeletonCard } from "@/ui/mobile-kit";
import { userFacingError } from "@/platform/errors";
import { isPhotoPickCancelled, pickProfilePhoto } from "@/platform/camera";
import { hapticError, hapticSuccess } from "@/platform/haptics";

type VStatus = {
  verified: boolean;
  status: "none" | "pending" | "approved" | "rejected";
  rejectReason: string | null;
  prompt: string;
};

export function VerificationPage() {
  const [data, setData] = useState<VStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await apiClient.get<VStatus>("/verification/status"));
    } catch (e) {
      setError(userFacingError(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function takeSelfie() {
    if (!data || busy) return;
    setError(null);
    try {
      const picked = await pickProfilePhoto("camera");
      setBusy(true);
      const prepared = await prepareImageForUpload(picked.blob, {
        maxEdge: 1280,
        quality: 0.8,
      });
      const contentType = prepared.type || "image/jpeg";
      const signed = await apiClient.post<{ mediaId: string; uploadUrl: string }>(
        "/verification/sign-upload",
        { contentType, sizeBytes: prepared.size }
      );
      const res = await fetch(String(signed.uploadUrl), {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: prepared,
      });
      if (!res.ok) throw new Error("Upload failed. Please try again.");
      await apiClient.post("/verification/submit", {
        mediaId: signed.mediaId,
        prompt: data.prompt,
      });
      await hapticSuccess();
      await load();
    } catch (e) {
      if (isPhotoPickCancelled(e)) return;
      await hapticError();
      setError(userFacingError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <Link to="/settings" className="back-btn" aria-label="Back">
          ←
        </Link>
        <h1>Photo verification</h1>
        <span />
      </header>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {!data && !error && <SkeletonCard />}
      {data && (
        <div className="stack">
          {data.verified ? (
            <EmptyState
              icon={<BadgeCheck size={22} />}
              title="You are verified"
              body="A blue tick now shows next to your name, so other members know your photos are really you."
            />
          ) : data.status === "pending" ? (
            <EmptyState
              icon={<BadgeCheck size={22} />}
              title="Under review"
              body="We received your selfie. A team member will review it soon and you will get a notification."
            />
          ) : (
            <>
              <p className="muted">
                Verified members get a blue tick and more trust. Take a quick
                selfie and our team will check it matches your profile photos.
                Your selfie is private and never shown to other members.
              </p>
              {data.status === "rejected" && data.rejectReason && (
                <div className="form-notice" role="status">
                  Not approved: {data.rejectReason}
                </div>
              )}
              <div className="card" style={{ padding: "1rem" }}>
                <strong>Your pose</strong>
                <p style={{ margin: "0.4rem 0 0" }}>{data.prompt}</p>
                <p className="muted small" style={{ margin: "0.4rem 0 0" }}>
                  Face the camera in good light, with your face clearly visible.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-block"
                disabled={busy}
                onClick={() => void takeSelfie()}
              >
                <Camera size={16} /> {busy ? "Uploading…" : "Take selfie"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

type Item = {
  id: string;
  name: string;
  age: number | null;
  prompt: string;
  submittedAt: string;
  selfieUrl: string | null;
  profilePhotoUrl: string | null;
};

export function AdminVerificationsPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Item | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get<{ items: Item[] }>("/admin/verifications");
      setItems(res.items ?? []);
    } catch (e) {
      setError(userFacingError(e));
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, path: "approve" | "reject", body: object = {}) {
    setBusyId(id);
    setError(null);
    try {
      await apiClient.post(`/admin/verifications/${id}/${path}`, body);
      await hapticSuccess();
      setRejecting(null);
      setReason("");
      await load();
    } catch (e) {
      await hapticError();
      setError(userFacingError(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="screen pad-tab">
      <header className="screen-header">
        <Link to="/admin" className="back-btn" aria-label="Back">
          ←
        </Link>
        <h1>Verifications</h1>
        <span />
      </header>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {items === null && <SkeletonCard />}
      {items && items.length === 0 && (
        <EmptyState
          icon={<BadgeCheck size={22} />}
          title="Nothing to review"
          body="New selfies will appear here."
        />
      )}
      {items?.map((v) => (
        <article key={v.id} className="admin-member-card">
          <strong>
            {v.name}
            {v.age != null ? `, ${v.age}` : ""}
          </strong>
          <p className="muted small" style={{ margin: "0.2rem 0 0.6rem" }}>
            Pose asked: {v.prompt}
          </p>
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <figure style={{ flex: 1, margin: 0 }}>
              {v.selfieUrl ? (
                <img src={v.selfieUrl} alt="Selfie" className="admin-shot" />
              ) : (
                <p className="muted small">Selfie unavailable</p>
              )}
              <figcaption className="muted small">Selfie</figcaption>
            </figure>
            <figure style={{ flex: 1, margin: 0 }}>
              {v.profilePhotoUrl ? (
                <img src={v.profilePhotoUrl} alt="Profile photo" className="admin-shot" />
              ) : (
                <p className="muted small">No profile photo</p>
              )}
              <figcaption className="muted small">Profile photo</figcaption>
            </figure>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.7rem" }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busyId === v.id}
              onClick={() => void act(v.id, "approve")}
            >
              Approve
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={busyId === v.id}
              onClick={() => setRejecting(v)}
            >
              Reject
            </button>
          </div>
        </article>
      ))}
      <BottomSheet
        open={rejecting != null}
        title={`Reject ${rejecting?.name ?? ""}?`}
        onClose={() => setRejecting(null)}
      >
        <div className="stack">
          <p className="muted small" style={{ margin: 0 }}>
            Tell the member why, so they can retake the selfie.
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Face not clearly visible"
            rows={3}
          />
          <button
            type="button"
            className="btn btn-danger btn-block"
            disabled={reason.trim().length < 3 || busyId != null}
            onClick={() =>
              rejecting && void act(rejecting.id, "reject", { reason: reason.trim() })
            }
          >
            Reject selfie
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
