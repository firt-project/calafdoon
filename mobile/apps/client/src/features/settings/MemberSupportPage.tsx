import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { support } from "@hel/api-client";
import { EmptyState, SkeletonCard } from "@/ui/mobile-kit";
import { userFacingError } from "@/platform/errors";
import { hapticError, hapticSuccess } from "@/platform/haptics";
import "@/features/admin/admin.css";

type SupportMsg = {
  id?: string;
  authorRole?: string;
  body?: string;
  createdAt?: string | number;
};

type SupportContact = {
  id?: string;
  _id?: string;
  topic?: string;
  subject?: string;
  status?: string;
  createdAt?: string;
  thread?: SupportMsg[];
  messages?: SupportMsg[];
};

const TOPICS = [
  { value: "account", label: "Account help" },
  { value: "payment", label: "Payment help" },
  { value: "photo_upload", label: "Photo upload" },
  { value: "other", label: "Other" },
] as const;

export function MemberSupportPage() {
  const [items, setItems] = useState<SupportContact[]>([]);
  const [selected, setSelected] = useState<SupportContact | null>(null);
  const [topic, setTopic] = useState<(typeof TOPICS)[number]["value"]>("account");
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [composing, setComposing] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await support.listMine();
      setItems(Array.isArray(res) ? (res as SupportContact[]) : []);
    } catch (e) {
      setError(userFacingError(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function openThread(c: SupportContact) {
    const id = c.id ?? c._id;
    if (!id) return;
    setBusy(true);
    try {
      const detail = (await support.getMine(id)) as SupportContact;
      setSelected({
        ...c,
        ...detail,
        thread: detail.messages ?? detail.thread ?? c.thread ?? [],
      });
      setReply("");
      setComposing(false);
    } catch (e) {
      setError(userFacingError(e));
    } finally {
      setBusy(false);
    }
  }

  async function createTicket(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const res = (await support.create({
        topic,
        message: message.trim(),
        source: "profile",
      })) as { contactId?: string };
      await hapticSuccess();
      setStatus("Message sent to support");
      setMessage("");
      setComposing(false);
      await reload();
      if (res?.contactId) {
        await openThread({ id: res.contactId });
      }
    } catch (err) {
      await hapticError();
      setError(userFacingError(err));
    } finally {
      setBusy(false);
    }
  }

  async function sendReply(e: FormEvent) {
    e.preventDefault();
    const id = selected?.id ?? selected?._id;
    if (!id || !reply.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await support.replyAsMember(id, reply.trim());
      await hapticSuccess();
      setReply("");
      await openThread({ id });
      await reload();
    } catch (err) {
      await hapticError();
      setError(userFacingError(err));
    } finally {
      setBusy(false);
    }
  }

  if (selected) {
    const thread = selected.thread ?? selected.messages ?? [];
    return (
      <div className="screen pad-tab">
        <header className="screen-header">
          <button
            type="button"
            className="back-btn"
            aria-label="Back"
            onClick={() => setSelected(null)}
          >
            ←
          </button>
          <h1>{selected.subject ?? "Support"}</h1>
        </header>
        <p className="muted small" style={{ marginTop: 0 }}>
          Status: {selected.status ?? "—"}
        </p>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="admin-thread">
          {thread.map((m, i) => (
            <div
              key={m.id ?? i}
              className={`admin-bubble ${m.authorRole === "admin" || m.authorRole === "owner" ? "staff" : "member"}`}
            >
              <strong>
                {m.authorRole === "admin" || m.authorRole === "owner"
                  ? "Support team"
                  : "You"}
              </strong>
              <p>{m.body}</p>
            </div>
          ))}
        </div>
        {selected.status !== "closed" && (
          <form className="form" style={{ marginTop: "0.85rem" }} onSubmit={(e) => void sendReply(e)}>
            <label>
              Continue conversation
              <textarea
                rows={3}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                required
                minLength={2}
                placeholder="Write another message…"
              />
            </label>
            <button className="btn btn-primary btn-block" disabled={busy} type="submit">
              {busy ? "Sending…" : "Send"}
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="screen pad-tab">
      <header className="screen-header">
        <Link to="/settings" className="back-btn" aria-label="Back">
          ←
        </Link>
        <h1>Message support</h1>
      </header>
      <p className="muted" style={{ marginTop: 0 }}>
        Message the owner/admin team directly. Replies appear here and as a notification.
      </p>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {status && (
        <div className="form-success" role="status">
          {status}
        </div>
      )}

      {!composing ? (
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => setComposing(true)}
        >
          New message to support
        </button>
      ) : (
        <form className="form" onSubmit={(e) => void createTicket(e)}>
          <label>
            Topic
            <select value={topic} onChange={(e) => setTopic(e.target.value as typeof topic)}>
              {TOPICS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Message
            <textarea
              rows={4}
              required
              minLength={10}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe what you need help with…"
            />
          </label>
          <button className="btn btn-primary btn-block" disabled={busy} type="submit">
            {busy ? "Sending…" : "Send to support"}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            onClick={() => setComposing(false)}
          >
            Cancel
          </button>
        </form>
      )}

      <h2 style={{ margin: "1.25rem 0 0.65rem", fontSize: "1.05rem" }}>Your threads</h2>
      {loading && <SkeletonCard />}
      {!loading && items.length === 0 ? (
        <EmptyState
          icon={<MessageCircle size={22} />}
          title="No support messages yet"
          body="Start a new message to reach owners and admins."
        />
      ) : (
        items.map((c) => {
          const id = c.id ?? c._id ?? "";
          const thread = c.thread ?? c.messages ?? [];
          const last = thread[thread.length - 1]?.body;
          return (
            <button
              key={id}
              type="button"
              className="admin-msg-card admin-msg-btn"
              onClick={() => void openThread(c)}
            >
              <strong>{c.subject ?? c.topic ?? "Support"}</strong>
              <p className="muted small" style={{ margin: "0.35rem 0 0" }}>
                {c.status ?? "—"}
                {last ? ` · ${last.slice(0, 80)}` : ""}
              </p>
            </button>
          );
        })
      )}
    </div>
  );
}
