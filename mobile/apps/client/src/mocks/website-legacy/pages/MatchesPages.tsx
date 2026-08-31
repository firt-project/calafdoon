import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { bumpData, useApp } from "@/hooks/use-app";
import { matchingActions } from "@/services/matching-actions";
import { getPeerById, scorePeers } from "@/services/matching-service";
import { safeErrorMessage } from "@/utils/cn";

export function MatchesPage() {
  const { session, profile, refresh, store } = useApp();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const scored = useMemo(() => {
    if (!profile || !session) return [];
    const reacted = new Set(
      store.reactions
        .filter((r) => r.fromUserId === session.userId)
        .map((r) => r.toPeerId)
    );
    return scorePeers(profile.answers).filter((row) => !reacted.has(row.peer.id));
  }, [profile, session, store.reactions]);

  if (!session || !profile) return null;

  function act(peerId: string, action: "like" | "pass" | "shortlist") {
    setError(null);
    setMessage(null);
    try {
      const match = matchingActions.react(session!.userId, peerId, action);
      bumpData();
      refresh();
      if (match) {
        setMessage("It's a match! Opening chat…");
        setTimeout(() => navigate(`/chat?match=${match.id}`), 500);
      } else if (action === "like") {
        setMessage("Liked. Some profiles may match you back.");
      } else if (action === "pass") {
        setMessage("Passed.");
      } else {
        setMessage("Saved to shortlist.");
      }
    } catch (err) {
      setError(safeErrorMessage(err, "Could not save action."));
    }
  }

  return (
    <div className="stack">
      <div>
        <h1 className="font-display" style={{ marginBottom: "0.35rem" }}>
          Discover
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          Compatibility is calculated on your device from your questionnaire answers.
        </p>
      </div>
      {error && <div className="form-error">{error}</div>}
      {message && <div className="form-success">{message}</div>}
      {scored.length === 0 ? (
        <div className="card" style={{ padding: "1.25rem" }}>
          <p className="muted">No more profiles to show. Check Likes or Messages.</p>
          <Link to="/likes" className="btn btn-secondary">
            View likes
          </Link>
        </div>
      ) : (
        scored.map(({ peer, score }) => (
          <article key={peer.id} className="peer-card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="row">
                <div className="peer-avatar">{peer.photoEmoji}</div>
                <div>
                  <h2 style={{ margin: 0, fontSize: "1.25rem" }}>
                    {peer.displayName}, {peer.answers.age}
                  </h2>
                  <p className="muted" style={{ margin: "0.2rem 0 0" }}>
                    {peer.answers.city}, {peer.answers.country}
                  </p>
                </div>
              </div>
              <span className="score-pill">{score.overall}%</span>
            </div>
            <p style={{ margin: 0 }}>{peer.bio}</p>
            <div className="chips">
              <span className="chip">{peer.answers.education}</span>
              <span className="chip">{peer.answers.prayerFrequency}</span>
              <span className="chip">{peer.answers.marriageTimeline}</span>
            </div>
            <div className="row">
              <button type="button" className="btn btn-secondary" onClick={() => act(peer.id, "pass")}>
                Pass
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => act(peer.id, "shortlist")}
              >
                Shortlist
              </button>
              <button type="button" className="btn btn-primary" onClick={() => act(peer.id, "like")}>
                Like
              </button>
            </div>
            <details>
              <summary>Compatibility breakdown</summary>
              <ul className="muted">
                <li>Religion: {score.religion}%</li>
                <li>Lifestyle: {score.lifestyle}%</li>
                <li>Values: {score.values}%</li>
                <li>Preferences: {score.preferences}%</li>
              </ul>
            </details>
          </article>
        ))
      )}
    </div>
  );
}

export function LikesPage() {
  const { session, refresh } = useApp();
  const [tab, setTab] = useState<"like" | "pass" | "shortlist">("like");
  if (!session) return null;
  const reactions = matchingActions.getReactions(session.userId);
  const filtered = reactions.filter((r) => r.action === tab);

  return (
    <div className="stack">
      <h1 className="font-display">Likes</h1>
      <div className="row">
        {(["like", "shortlist", "pass"] as const).map((key) => (
          <button
            key={key}
            type="button"
            className={tab === key ? "btn btn-primary" : "btn btn-secondary"}
            onClick={() => setTab(key)}
          >
            {key}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="muted">Nothing here yet.</p>
      ) : (
        filtered.map((r) => {
          const peer = getPeerById(r.toPeerId);
          if (!peer) return null;
          return (
            <article key={`${r.toPeerId}-${r.action}`} className="peer-card">
              <div className="row">
                <div className="peer-avatar">{peer.photoEmoji}</div>
                <div>
                  <strong>
                    {peer.displayName}, {peer.answers.age}
                  </strong>
                  <div className="muted">
                    {peer.answers.city}, {peer.answers.country}
                  </div>
                </div>
              </div>
              {tab !== "like" && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    matchingActions.react(session.userId, peer.id, "like");
                    bumpData();
                    refresh();
                    setTab("like");
                  }}
                >
                  Like instead
                </button>
              )}
            </article>
          );
        })
      )}
    </div>
  );
}
