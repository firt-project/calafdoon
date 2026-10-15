import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "@hel/api-client";
import { SkeletonCard } from "@/ui/mobile-kit";
import { userFacingError } from "@/platform/errors";
import { hapticError, hapticSuccess } from "@/platform/haptics";

export type AccountStatus = {
  currentStatus: string;
  banned: boolean;
  nextStep: string;
  latestPublicReason: string | null;
  statusChangedAt: string;
  suspensionExpiresAt: string | null;
  appeal: {
    status: string;
    submittedAt: string;
    adminResponse: string | null;
  } | null;
  timeline: Array<{
    id: string;
    eventType: string;
    publicUserMessage?: string | null;
    createdAt: string;
  }>;
};

const LABELS: Record<string, { title: string; tone: "ok" | "warn" | "bad" | "info" }> = {
  approved: { title: "Approved", tone: "ok" },
  pending_review: { title: "Under review", tone: "info" },
  rejected: { title: "Not approved", tone: "bad" },
  changes_requested: { title: "Changes needed", tone: "warn" },
  paused: { title: "Paused", tone: "warn" },
  suspended: { title: "Suspended", tone: "bad" },
  banned: { title: "Banned", tone: "bad" },
  incomplete: { title: "Profile incomplete", tone: "warn" },
};

export function statusNeedsAttention(status: string | undefined): boolean {
  return ["rejected", "changes_requested", "paused", "suspended", "banned"].includes(
    status ?? ""
  );
}

function when(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function AccountStatusPage() {
  const [data, setData] = useState<AccountStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [appeal, setAppeal] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await apiClient.get<AccountStatus>("/account-status"));
    } catch (e) {
      setError(userFacingError(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await hapticSuccess();
      setNotice(done);
      setAppeal("");
      await load();
    } catch (e) {
      await hapticError();
      setError(userFacingError(e));
    } finally {
      setBusy(false);
    }
  }

  const status = data?.currentStatus ?? "";
  const meta = LABELS[status] ?? { title: status || "Unknown", tone: "info" as const };
  const canResubmit = status === "rejected" || status === "changes_requested";
  const canAppeal =
    (status === "banned" || status === "suspended") &&
    data?.appeal?.status !== "pending";

  return (
    <div className="screen">
      <header className="screen-header">
        <Link to="/settings" className="back-btn" aria-label="Back">
          ←
        </Link>
        <h1>Account status</h1>
        <span />
      </header>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="form-notice" role="status">
          {notice}
        </div>
      )}
      {!data && !error && <SkeletonCard />}
      {data && (
        <div className="stack">
          <div className="card" style={{ padding: "1rem" }}>
            <span className={`admin-pill${meta.tone === "ok" ? " ok" : meta.tone === "bad" ? " danger" : ""}`}>
              {meta.title}
            </span>
            {data.latestPublicReason && (
              <p style={{ margin: "0.7rem 0 0" }}>
                <strong>Message from our team:</strong>
                <br />
                {data.latestPublicReason}
              </p>
            )}
            <p className="muted" style={{ margin: "0.7rem 0 0" }}>
              {data.nextStep}
            </p>
            {status === "suspended" && data.suspensionExpiresAt && (
              <p className="muted small" style={{ margin: "0.4rem 0 0" }}>
                Suspension ends {when(data.suspensionExpiresAt)}.
              </p>
            )}
          </div>

          {canResubmit && (
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={busy}
              onClick={() =>
                void act(
                  () => apiClient.post("/account-status/resubmit", {}),
                  "Sent for review. We will notify you."
                )
              }
            >
              I fixed it — send for review
            </button>
          )}
          {canResubmit && (
            <Link to="/profile" className="btn btn-secondary btn-block">
              Edit my profile and photos
            </Link>
          )}

          {data.appeal && (
            <div className="card" style={{ padding: "1rem" }}>
              <strong>Your appeal</strong>
              <p className="muted small" style={{ margin: "0.3rem 0 0" }}>
                Status: {data.appeal.status} · sent {when(data.appeal.submittedAt)}
              </p>
              {data.appeal.adminResponse && (
                <p style={{ margin: "0.5rem 0 0" }}>{data.appeal.adminResponse}</p>
              )}
            </div>
          )}

          {canAppeal && (
            <div className="stack">
              <strong>Think this is a mistake?</strong>
              <textarea
                rows={4}
                value={appeal}
                onChange={(e) => setAppeal(e.target.value)}
                placeholder="Explain what happened (at least 10 characters)"
              />
              <button
                type="button"
                className="btn btn-secondary btn-block"
                disabled={busy || appeal.trim().length < 10}
                onClick={() =>
                  void act(
                    () => apiClient.post("/account-status/appeals", { message: appeal.trim() }),
                    "Appeal sent. We will reply here."
                  )
                }
              >
                Send appeal
              </button>
            </div>
          )}

          {data.timeline.length > 0 && (
            <div className="stack">
              <strong>History</strong>
              {data.timeline.slice(0, 15).map((t) => (
                <div key={t.id} className="card" style={{ padding: "0.7rem 0.9rem" }}>
                  <span className="muted small">{when(t.createdAt)}</span>
                  <div>{t.publicUserMessage || t.eventType.replace(/_/g, " ")}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
