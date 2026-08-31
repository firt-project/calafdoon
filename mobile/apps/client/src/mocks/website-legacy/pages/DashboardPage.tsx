import { Link } from "react-router-dom";
import { Bell, Heart, MessageCircle, Sparkles } from "lucide-react";
import { useApp } from "@/hooks/use-app";
import { useTranslation } from "@/lib/i18n/context";
import { matchingActions } from "@/services/matching-actions";
import { scorePeers } from "@/services/matching-service";

export function DashboardPage() {
  const { t } = useTranslation();
  const { session, profile } = useApp();
  if (!session || !profile) return null;

  const name = profile.answers.name?.split(" ")[0] || "there";
  const scored = scorePeers(profile.answers);
  const reactions = matchingActions.getReactions(session.userId);
  const likes = reactions.filter((r) => r.action === "like").length;
  const matches = matchingActions.getMatches(session.userId).length;
  const unread = matchingActions
    .getNotifications(session.userId)
    .filter((n) => !n.read).length;

  return (
    <div className="stack">
      <section className="member-hero">
        <p style={{ margin: 0, opacity: 0.9 }}>Assalamu alaikum</p>
        <h1 className="font-display" style={{ margin: "0.35rem 0 0.5rem", fontSize: "2rem" }}>
          {name}
        </h1>
        <p style={{ margin: 0, opacity: 0.9, maxWidth: "28rem" }}>
          Discover compatible matches offline. Your data stays on this device.
        </p>
      </section>

      <div className="grid-2">
        <Link to="/matches" className="stat-card">
          <Sparkles size={18} color="var(--primary)" />
          <strong style={{ display: "block", marginTop: "0.4rem" }}>{scored.length}</strong>
          <span className="muted">{t("app.discover")}</span>
        </Link>
        <Link to="/likes" className="stat-card">
          <Heart size={18} color="var(--primary)" />
          <strong style={{ display: "block", marginTop: "0.4rem" }}>{likes}</strong>
          <span className="muted">{t("app.likes")}</span>
        </Link>
        <Link to="/chat" className="stat-card">
          <MessageCircle size={18} color="var(--primary)" />
          <strong style={{ display: "block", marginTop: "0.4rem" }}>{matches}</strong>
          <span className="muted">{t("app.messages")}</span>
        </Link>
        <Link to="/notifications" className="stat-card">
          <Bell size={18} color="var(--primary)" />
          <strong style={{ display: "block", marginTop: "0.4rem" }}>{unread}</strong>
          <span className="muted">{t("app.notifications")}</span>
        </Link>
      </div>

      <section className="card" style={{ padding: "1.25rem" }}>
        <h2 className="font-display" style={{ marginTop: 0 }}>
          Top matches
        </h2>
        {scored.slice(0, 3).length === 0 ? (
          <p className="muted">Complete preferences to see more matches.</p>
        ) : (
          <div className="stack">
            {scored.slice(0, 3).map(({ peer, score }) => (
              <div key={peer.id} className="row" style={{ justifyContent: "space-between" }}>
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
                <span className="score-pill">{score.overall}%</span>
              </div>
            ))}
          </div>
        )}
        <Link to="/matches" className="btn btn-primary" style={{ marginTop: "1rem" }}>
          {t("app.discover")}
        </Link>
      </section>
    </div>
  );
}
