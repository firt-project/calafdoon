import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { bumpData, useApp } from "@/hooks/use-app";
import { matchingActions } from "@/services/matching-actions";
import { getPeerById } from "@/services/matching-service";
import { formatTime, safeErrorMessage } from "@/utils/cn";
import { cn } from "@/utils/cn";

export function ChatPage() {
  const { session, refresh } = useApp();
  const [params, setParams] = useSearchParams();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const onChange = () => {
      refresh();
      setTick((n) => n + 1);
    };
    window.addEventListener("hel:data-changed", onChange);
    return () => window.removeEventListener("hel:data-changed", onChange);
  }, [refresh]);

  const matches = session ? matchingActions.getMatches(session.userId) : [];
  const activeId = params.get("match") ?? matches[0]?.id ?? null;
  const active = matches.find((m) => m.id === activeId) ?? null;
  const peer = active ? getPeerById(active.peerId) : undefined;
  const messages = active ? matchingActions.getMessages(active.id) : [];

  useEffect(() => {
    if (active && session) {
      matchingActions.markMatchSeen(active.id);
    }
  }, [active, session]);

  if (!session) return null;
  const userId = session.userId;

  function send(e: FormEvent) {
    e.preventDefault();
    if (!active) return;
    setError(null);
    try {
      matchingActions.sendMessage(userId, active.id, body);
      setBody("");
      bumpData();
      refresh();
    } catch (err) {
      setError(safeErrorMessage(err, "Could not send message."));
    }
  }

  return (
    <div className="stack">
      <h1 className="font-display">Messages</h1>
      {matches.length === 0 ? (
        <div className="card" style={{ padding: "1.25rem" }}>
          <p className="muted">No matches yet. Like profiles on Discover to open a chat.</p>
          <Link to="/matches" className="btn btn-primary">
            Discover
          </Link>
        </div>
      ) : (
        <div className="chat-layout">
          <aside className="stack">
            {matches.map((m) => {
              const p = getPeerById(m.peerId);
              return (
                <button
                  key={m.id}
                  type="button"
                  className={cn("option-pill", activeId === m.id && "selected")}
                  onClick={() => setParams({ match: m.id })}
                >
                  {p?.photoEmoji} {p?.displayName ?? "Match"}
                </button>
              );
            })}
          </aside>
          <section className="stack">
            <div className="card" style={{ padding: "1rem" }}>
              <strong>
                {peer?.photoEmoji} {peer?.displayName}
              </strong>
              <div className="muted">
                {peer?.answers.city}, {peer?.answers.country}
              </div>
            </div>
            {error && <div className="form-error">{error}</div>}
            <div className="chat-thread">
              {messages.map((msg) => (
                <div key={msg.id} className={cn("bubble", msg.sender)}>
                  <div>{msg.body}</div>
                  <div style={{ fontSize: "0.75rem", opacity: 0.75, marginTop: "0.25rem" }}>
                    {formatTime(msg.createdAt)}
                  </div>
                </div>
              ))}
            </div>
            <form className="row" onSubmit={send}>
              <input
                style={{ flex: 1, borderRadius: "0.85rem", border: "1px solid var(--border)", padding: "0.75rem" }}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write a respectful message…"
              />
              <button type="submit" className="btn btn-primary">
                Send
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

export function NotificationsPage() {
  const { session, refresh } = useApp();
  if (!session) return null;
  const notes = matchingActions.getNotifications(session.userId);

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 className="font-display">Notifications</h1>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            matchingActions.markNotificationsRead(session.userId);
            bumpData();
            refresh();
          }}
        >
          Mark all read
        </button>
      </div>
      {notes.length === 0 ? (
        <p className="muted">No notifications yet.</p>
      ) : (
        notes.map((n) => (
          <article key={n.id} className="card" style={{ padding: "1rem", opacity: n.read ? 0.75 : 1 }}>
            <strong>{n.title}</strong>
            <p className="muted" style={{ margin: "0.35rem 0" }}>
              {n.body}
            </p>
            {n.href && (
              <Link to={n.href} className="btn btn-ghost">
                Open
              </Link>
            )}
          </article>
        ))
      )}
    </div>
  );
}
