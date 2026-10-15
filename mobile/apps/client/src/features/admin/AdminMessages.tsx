import "./admin.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { MessageCircle, PenSquare, Search, X } from "lucide-react";
import { admin, apiClient, support } from "@hel/api-client";
import { BottomSheet, EmptyState, SkeletonCard } from "@/ui/mobile-kit";
import { userFacingError } from "@/platform/errors";
import { hapticError, hapticSuccess } from "@/platform/haptics";

/* ───────── shared bits ───────── */

function initials(name?: string | null): string {
  return (name?.trim()?.[0] ?? "?").toUpperCase();
}

function Avatar({ name, src, size = 44 }: { name?: string | null; src?: string | null; size?: number }) {
  return (
    <span className="adm-avatar" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden>
      {src ? <img src={src} alt="" loading="lazy" /> : initials(name)}
    </span>
  );
}

function ago(value?: number | string | null): string {
  if (value == null) return "";
  const t = typeof value === "number" ? value : Date.parse(value);
  if (Number.isNaN(t)) return "";
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(t).toLocaleDateString([], { day: "numeric", month: "short" });
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="admin-search">
      <Search size={18} className="admin-search-icon" aria-hidden />
      <input
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {value && (
        <button type="button" className="admin-search-clear" aria-label="Clear search" onClick={() => onChange("")}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}

/* ───────── types ───────── */

type SupportMsg = { id?: string; authorRole?: string; body?: string; createdAt?: string | number };
type SupportContact = {
  id?: string;
  _id?: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  topic?: string;
  subject?: string;
  status?: string;
  profileId?: string | null;
  canReply?: boolean;
  createdAt?: number;
  thread?: SupportMsg[];
};
type MemberCard = { userId: string; name: string; profileId: string | null; imageUrl: string | null };
type ConvRow = {
  conversationId: string;
  lastMessageAt?: number;
  lastMessage?: { body?: string; hasImage?: boolean } | null;
  memberA: MemberCard;
  memberB: MemberCard;
};
type ThreadMsg = {
  id: string;
  body: string;
  hasImage?: boolean;
  imageUrl?: string | null;
  senderId: string;
  createdAt: number;
  deleted?: boolean;
};

/* ───────── Messages hub: Support | Member chats ───────── */

export function AdminMessagesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab: "support" | "chats" = params.get("tab") === "chats" ? "chats" : "support";
  // Tab lives in the URL (replace, no history entry) so Back from a person returns here.
  const setTab = (next: "support" | "chats") => setParams({ tab: next }, { replace: true });
  return (
    <div className="screen pad-tab">
      <header className="screen-header">
        {params.get("c") ? (
          <button type="button" className="back-btn" aria-label="Back" onClick={() => navigate(-1)}>
            ←
          </button>
        ) : (
          <Link to="/admin" className="back-btn" aria-label="Back">
            ←
          </Link>
        )}
        <h1>Messages</h1>
      </header>
      <div className="adm-seg" role="tablist" aria-label="Message type">
        <button type="button" role="tab" aria-selected={tab === "support"} className={tab === "support" ? "on" : ""} onClick={() => setTab("support")}>
          Support
        </button>
        <button type="button" role="tab" aria-selected={tab === "chats"} className={tab === "chats" ? "on" : ""} onClick={() => setTab("chats")}>
          Member chats
        </button>
      </div>
      {tab === "support" ? <SupportInbox /> : <ChatsInbox />}
    </div>
  );
}

/* ───────── Start a support message with any member ───────── */

type PickMember = { userId: string; name: string; email?: string | null; imageUrl?: string | null };

export function ComposeSupportSheet({
  open,
  onClose,
  preset,
}: {
  open: boolean;
  onClose: () => void;
  preset?: { userId: string; name: string } | null;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickMember[]>([]);
  const [picked, setPicked] = useState<PickMember | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = preset ?? picked;

  useEffect(() => {
    if (!open || preset || picked || query.trim().length < 2) {
      setResults([]);
      return;
    }
    let alive = true;
    const t = window.setTimeout(() => {
      admin.users
        .list({ search: query.trim(), role: "user", limit: 12 })
        .then((res) => {
          const rows = (res as { items?: Array<Record<string, unknown>> })?.items ?? [];
          if (!alive) return;
          setResults(
            rows
              .filter((r) => typeof r.userId === "string")
              .map((r) => ({
                userId: String(r.userId),
                name: String(r.name ?? r.email ?? "Member"),
                email: (r.email as string) ?? null,
                imageUrl: (r.imageUrl as string) ?? null,
              }))
          );
        })
        .catch(() => alive && setResults([]));
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [query, open, preset, picked]);

  function reset() {
    setQuery("");
    setResults([]);
    setPicked(null);
    setSubject("");
    setMessage("");
    setError(null);
  }

  async function send() {
    if (!target || message.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiClient.post<{ contactId: string }>("/admin/support/start", {
        userId: target.userId,
        message: message.trim(),
        subject: subject.trim() || undefined,
      });
      await hapticSuccess();
      reset();
      onClose();
      navigate(`/admin/messages?tab=support&c=${encodeURIComponent(res.contactId)}`);
    } catch (e) {
      await hapticError();
      setError(userFacingError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet
      open={open}
      title="New support message"
      onClose={() => {
        reset();
        onClose();
      }}
    >
      <div className="stack">
        {target ? (
          <div className="adm-person">
            <Avatar name={target.name} src={picked?.imageUrl ?? null} size={40} />
            <div className="adm-person-meta">
              <strong>{target.name}</strong>
              <span className="muted small">will receive your message</span>
            </div>
            {!preset && (
              <button type="button" className="linkish" onClick={() => setPicked(null)}>
                Change
              </button>
            )}
          </div>
        ) : (
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a member by name or email…"
              aria-label="Search member"
              autoComplete="off"
            />
            {results.map((r) => (
              <button key={r.userId} type="button" className="adm-row" onClick={() => setPicked(r)}>
                <Avatar name={r.name} src={r.imageUrl} size={38} />
                <span className="adm-row-body">
                  <strong>{r.name}</strong>
                  <span className="adm-row-prev">{r.email ?? ""}</span>
                </span>
              </button>
            ))}
            {query.trim().length >= 2 && results.length === 0 && (
              <p className="muted small">No members found.</p>
            )}
          </>
        )}
        {target && (
          <>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject (optional)"
              maxLength={120}
            />
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write your message…"
            />
            {error && <div className="form-error" role="alert">{error}</div>}
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={busy || message.trim().length < 2}
              onClick={() => void send()}
            >
              {busy ? "Sending…" : "Send message"}
            </button>
            <p className="muted small" style={{ margin: 0 }}>
              The member gets a notification, a push and an email, and can reply from Settings → Support.
            </p>
          </>
        )}
      </div>
    </BottomSheet>
  );
}

/* ───────── Support ───────── */

function SupportInbox() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const selectedId = params.get("c");
  const [status, setStatus] = useState<"all" | "open" | "reviewed" | "closed">("open");
  const [composeOpen, setComposeOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<SupportContact[]>([]);
  const [selected, setSelected] = useState<SupportContact | null>(null);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = (await support.admin.list({
        status: status === "all" ? undefined : status,
        limit: 100,
      })) as { items?: SupportContact[] };
      setItems(Array.isArray(res?.items) ? res.items : []);
    } catch (e) {
      setError(userFacingError(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) =>
      [c.name, c.email, c.phone, c.subject, c.topic, c.thread?.[c.thread.length - 1]?.body]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [items, search]);

  // Opening a person pushes a history entry, so Back returns to this list.
  function open(c: SupportContact) {
    const id = c.id ?? c._id;
    if (id) navigate(`/admin/messages?tab=support&c=${encodeURIComponent(id)}`);
  }

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }
    let alive = true;
    setBusy(true);
    setError(null);
    support.admin
      .get(selectedId)
      .then((raw) => {
        if (!alive) return;
        const detail = raw as SupportContact & { messages?: SupportMsg[] };
        setSelected({ ...detail, thread: detail.messages ?? detail.thread ?? [] });
        setReply("");
        setNotice(null);
      })
      .catch((e) => {
        if (alive) setError(userFacingError(e));
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [selectedId]);

  async function refreshSelected(id: string, base: SupportContact) {
    const detail = (await support.admin.get(id)) as SupportContact & { messages?: SupportMsg[] };
    setSelected({ ...base, ...detail, thread: detail.messages ?? detail.thread ?? [] });
  }

  async function sendReply() {
    const id = selected?.id ?? selected?._id;
    if (!id || !selected || !reply.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await support.admin.reply(id, reply.trim());
      await hapticSuccess();
      setNotice("Reply sent");
      setReply("");
      await refreshSelected(id, selected);
      void load();
    } catch (e) {
      await hapticError();
      setError(userFacingError(e));
    } finally {
      setBusy(false);
    }
  }

  async function setContactStatus(next: "open" | "reviewed" | "closed") {
    const id = selected?.id ?? selected?._id;
    if (!id) return;
    setBusy(true);
    try {
      await support.admin.updateStatus(id, next);
      await hapticSuccess();
      setSelected((p) => (p ? { ...p, status: next } : p));
      void load();
    } catch (e) {
      await hapticError();
      setError(userFacingError(e));
    } finally {
      setBusy(false);
    }
  }

  if (selectedId && !selected) {
    return (
      <div className="adm-detail">
        <button type="button" className="adm-back" onClick={() => navigate(-1)}>
          ← All support messages
        </button>
        {error ? <div className="form-error" role="alert">{error}</div> : <SkeletonCard />}
      </div>
    );
  }

  if (selected) {
    const thread = selected.thread ?? [];
    return (
      <div className="adm-detail">
        <button type="button" className="adm-back" onClick={() => navigate(-1)}>
          ← All support messages
        </button>
        <div className="adm-person">
          <Avatar name={selected.name} size={52} />
          <div className="adm-person-meta">
            <strong>{selected.name ?? "Member"}</strong>
            <span className="muted small">
              {[selected.email, selected.phone].filter(Boolean).join(" · ") || "No contact details"}
            </span>
            <span className="muted small">
              {selected.subject ?? selected.topic ?? "Support"}
            </span>
          </div>
          <span className={`admin-pill${selected.status === "closed" ? "" : selected.status === "reviewed" ? " ok" : " danger"}`}>
            {selected.status ?? "open"}
          </span>
        </div>
        {selected.profileId && (
          <Link to={`/admin/members/${selected.profileId}`} className="btn btn-secondary btn-block">
            View member profile
          </Link>
        )}
        {error && <div className="form-error" role="alert">{error}</div>}
        {notice && <div className="form-success" role="status">{notice}</div>}
        <div className="adm-thread">
          {thread.map((m, i) => {
            const staff = m.authorRole === "admin" || m.authorRole === "owner";
            return (
              <div key={m.id ?? i} className={`adm-bubble ${staff ? "staff" : "member"}`}>
                <span className="adm-bubble-who">{staff ? "Staff" : (selected.name ?? "Member")}</span>
                <p>{m.body}</p>
                {m.createdAt != null && (
                  <span className="adm-bubble-time">{new Date(m.createdAt).toLocaleString()}</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="admin-chip-row">
          {(["open", "reviewed", "closed"] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={`admin-chip${selected.status === s ? " active" : ""}`}
              disabled={busy}
              onClick={() => void setContactStatus(s)}
            >
              Mark {s}
            </button>
          ))}
        </div>
        {(
          <form
            className="adm-reply"
            onSubmit={(e) => {
              e.preventDefault();
              void sendReply();
            }}
          >
            <textarea
              rows={2}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder={selected.canReply === false ? "Reply by email…" : "Write a reply…"}
              aria-label="Reply"
              autoFocus={params.get("reply") === "1"}
            />
            <button className="btn btn-primary" disabled={busy || reply.trim().length < 2} type="submit">
              {busy ? "…" : "Send"}
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <>
      <ComposeSupportSheet open={composeOpen} onClose={() => setComposeOpen(false)} />
      <div className="adm-searchrow">
        <SearchBox value={search} onChange={setSearch} placeholder="Search name, email, phone, subject…" />
        <button type="button" className="adm-compose-btn" aria-label="New message to a member" onClick={() => setComposeOpen(true)}>
          <PenSquare size={18} />
        </button>
      </div>
      <div className="admin-chip-row" role="tablist" aria-label="Support status">
        {(
          [
            ["open", "Open"],
            ["reviewed", "Reviewed"],
            ["closed", "Closed"],
            ["all", "All"],
          ] as const
        ).map(([key, label]) => (
          <button key={key} type="button" className={`admin-chip${status === key ? " active" : ""}`} onClick={() => setStatus(key)}>
            {label}
          </button>
        ))}
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {loading && <SkeletonCard />}
      {!loading && shown.length === 0 && (
        <EmptyState
          icon={<MessageCircle size={22} />}
          title={search ? "No match" : "No support messages"}
          body={search ? "Try a different name or word." : "Messages members send to support appear here."}
        />
      )}
      {shown.map((c) => {
        const last = c.thread?.[c.thread.length - 1];
        return (
          <div
            key={c.id ?? c._id}
            role="button"
            tabIndex={0}
            className="adm-row"
            onClick={() => open(c)}
            onKeyDown={(e) => {
              if (e.key === "Enter") open(c);
            }}
          >
            {c.profileId ? (
              <Link
                to={`/admin/members/${c.profileId}`}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Open ${c.name ?? "member"} profile`}
              >
                <Avatar name={c.name} />
              </Link>
            ) : (
              <Avatar name={c.name} />
            )}
            <span className="adm-row-body">
              <span className="adm-row-top">
                <strong>
                  <span className={`adm-dot ${c.status ?? "open"}`} title={c.status} style={{ display: "inline-block", marginRight: 6 }} />
                  {c.name ?? "Member"}
                </strong>
                <span className="muted small">{ago(last?.createdAt ?? c.createdAt)}</span>
              </span>
              <span className="adm-row-sub">{c.subject ?? c.topic ?? "Support"}</span>
              <span className="adm-row-prev">{last?.body ?? "Open thread"}</span>
            </span>
            <button
              type="button"
              className="adm-quick-reply"
              onClick={(e) => {
                e.stopPropagation();
                const id = c.id ?? c._id;
                if (id) navigate(`/admin/messages?tab=support&c=${encodeURIComponent(id)}&reply=1`);
              }}
            >
              Reply
            </button>
          </div>
        );
      })}
    </>
  );
}

/* ───────── Member chats list ───────── */

function ChatsInbox() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<ConvRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const t = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      admin.conversations
        .list({ limit: 60, search: search.trim() || undefined })
        .then((res) => {
          if (alive) setItems(Array.isArray(res) ? (res as ConvRow[]) : []);
        })
        .catch((e) => {
          if (alive) {
            setError(userFacingError(e));
            setItems([]);
          }
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [search]);

  return (
    <>
      <SearchBox value={search} onChange={setSearch} placeholder="Search by member name or email…" />
      <p className="muted small" style={{ margin: "0 0 0.7rem" }}>
        Tap a chat to read it and open either member's profile.
      </p>
      {error && <div className="form-error" role="alert">{error}</div>}
      {loading && <SkeletonCard />}
      {!loading && items.length === 0 && (
        <EmptyState
          icon={<MessageCircle size={22} />}
          title={search ? "No chats found" : "No match chats yet"}
          body={search ? "Try another member name." : "When members match and chat, they appear here."}
        />
      )}
      {items.map((c) => (
        <div key={c.conversationId} role="button" tabIndex={0} className="adm-row" onClick={() => navigate(`/admin/chats/${c.conversationId}`)} onKeyDown={(e) => { if (e.key === "Enter") navigate(`/admin/chats/${c.conversationId}`); }}>
          <span className="adm-pair">
            {[c.memberA, c.memberB].map((m) =>
              m?.profileId ? (
                <Link
                  key={m.userId}
                  to={`/admin/members/${m.profileId}`}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Open ${m.name} profile`}
                >
                  <Avatar name={m.name} src={m.imageUrl} size={40} />
                </Link>
              ) : (
                <Avatar key={m?.userId} name={m?.name} src={m?.imageUrl} size={40} />
              )
            )}
          </span>
          <span className="adm-row-body">
            <span className="adm-row-top">
              <strong>
                {c.memberA?.name ?? "A"} <span className="muted">&amp;</span> {c.memberB?.name ?? "B"}
              </strong>
              <span className="muted small">{ago(c.lastMessageAt)}</span>
            </span>
            <span className="adm-row-prev">
              {c.lastMessage ? c.lastMessage.body || (c.lastMessage.hasImage ? "📷 Photo" : "") : "No messages yet"}
            </span>
          </span>
        </div>
      ))}
    </>
  );
}

/* ───────── Full chat transcript (also reached from Reports) ───────── */

export function AdminChatTranscriptPage() {
  const { conversationId = "" } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<{
    memberA: MemberCard;
    memberB: MemberCard;
    messages: ThreadMsg[];
    truncated?: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    admin.conversations
      .thread(conversationId, { limit: 500 })
      .then((r) => setData(r as never))
      .catch((e) => setError(userFacingError(e)));
  }, [conversationId]);

  const nameOf = (id: string) =>
    data?.memberA.userId === id ? data.memberA.name : data?.memberB.userId === id ? data.memberB.name : "Member";

  return (
    <div className="screen pad-tab">
      <header className="screen-header">
        <button type="button" className="back-btn" aria-label="Back" onClick={() => navigate(-1)}>
          ←
        </button>
        <h1>Chat</h1>
      </header>
      {error && <div className="form-error" role="alert">{error}</div>}
      {!data && !error && <SkeletonCard />}
      {data && (
        <>
          <div className="adm-people">
            {[data.memberA, data.memberB].map((m, i) => (
              <div key={m.userId} className="adm-person-card">
                <Avatar name={m.name} src={m.imageUrl} size={56} />
                <strong>{m.name}</strong>
                {m.profileId ? (
                  <Link to={`/admin/members/${m.profileId}`} className="btn btn-secondary btn-sm">
                    View profile
                  </Link>
                ) : (
                  <span className="muted small">No profile</span>
                )}
                <span className={`adm-legend ${i === 0 ? "a" : "b"}`}>{i === 0 ? "Left" : "Right"}</span>
              </div>
            ))}
          </div>
          <p className="muted small" style={{ textAlign: "center" }}>
            Read-only · {data.messages.length} message{data.messages.length === 1 ? "" : "s"}
            {data.truncated ? " (latest 500)" : ""}
          </p>
          <div className="adm-thread">
            {data.messages.length === 0 && <p className="muted center">No messages yet.</p>}
            {data.messages.map((m) => {
              const left = m.senderId === data.memberA.userId;
              return (
                <div key={m.id} className={`adm-bubble ${left ? "a" : "b"}`}>
                  <span className="adm-bubble-who">{nameOf(m.senderId)}</span>
                  {m.deleted ? (
                    <p style={{ fontStyle: "italic", opacity: 0.7 }}>Message deleted by sender</p>
                  ) : (
                    <>
                      {m.imageUrl && <img src={m.imageUrl} alt="" className="adm-img" loading="lazy" />}
                      {m.body && <p>{m.body}</p>}
                      {!m.body && m.hasImage && !m.imageUrl && <p className="muted">[Photo unavailable]</p>}
                    </>
                  )}
                  <span className="adm-bubble-time">{new Date(m.createdAt).toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
