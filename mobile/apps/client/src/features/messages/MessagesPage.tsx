import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Archive,
  BellOff,
  MessageCircle,
  Pin,
  Trash2,
} from "lucide-react";
import { chat, matching, subscribeRealtime, ApiClientError } from "@hel/api-client";
import { EmptyState, SkeletonCard } from "@/ui/mobile-kit";
import {
  Avatar,
  FilterChip,
  PageTitle,
  ScreenContainer,
  SearchField,
} from "@/ui/design-system";
import { useTranslation } from "@/lib/i18n/context";
import { hapticLight, hapticMedium } from "@/platform/haptics";
import { useRealtimeRefresh } from "@/platform/useRealtimeRefresh";
import { cn } from "@/utils/cn";

type ConversationRow = {
  conversationId?: string | null;
  id?: string;
  matchId?: string;
  profile?: {
    name?: string | null;
    imageUrl?: string | null;
    userId?: string;
  } | null;
  title?: string;
  peerName?: string;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  unreadCount?: number;
  updatedAt?: string;
  online?: boolean;
  score?: number;
  isNew?: boolean;
  pinned?: boolean;
};

type FilterId = "all" | "unread" | "pinned";

const PINNED_KEY = "hel_pinned_conversations";
const MUTED_KEY = "hel_muted_conversations";
const HIDDEN_KEY = "hel_hidden_conversations";
const SWIPE_ACTION = 76;
const SWIPE_OPEN = 220;

function loadIdSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveIdSet(key: string, ids: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...ids]));
}

function previewText(last: string | null | undefined, emptyLabel: string): string {
  if (!last) return emptyLabel;
  const trimmed = last.trim();
  return trimmed.length > 72 ? `${trimmed.slice(0, 69)}…` : trimmed;
}

function formatWhen(when: string | undefined | null, locale: string): string {
  if (!when) return "";
  const d = new Date(when);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return locale.startsWith("so") ? "Shalay" : "Yesterday";
  }
  return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

function isActiveChat(c: ConversationRow): boolean {
  const id = c.conversationId ?? c.id;
  if (!id) return false;
  return Boolean(c.lastMessage && c.lastMessage.trim());
}

function rowId(c: ConversationRow): string {
  return String(c.conversationId ?? c.id ?? "");
}

export function MessagesPage() {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState<ConversationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [pinned, setPinned] = useState<Set<string>>(() => loadIdSet(PINNED_KEY));
  const [muted, setMuted] = useState<Set<string>>(() => loadIdSet(MUTED_KEY));
  const [hidden, setHidden] = useState<Set<string>>(() => loadIdSet(HIDDEN_KEY));
  const [typingMap, setTypingMap] = useState<Record<string, boolean>>({});
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const aliveRef = useRef(true);

  const loadConversations = useCallback(async () => {
    try {
      const data = await chat.getConversations();
      if (!aliveRef.current) return;
      const list = Array.isArray(data)
        ? (data as ConversationRow[])
        : data && typeof data === "object" && "items" in data
          ? (data as { items: ConversationRow[] }).items
          : [];
      setItems(list.filter(isActiveChat));
      setError(null);
    } catch (e) {
      if (!aliveRef.current) return;
      setError(
        e instanceof ApiClientError ? e.message : "Failed to load conversations"
      );
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void loadConversations();
    return () => {
      aliveRef.current = false;
    };
  }, [loadConversations]);

  // Keep the inbox fresh when a message lands or the app resumes.
  useRealtimeRefresh(
    ["message:new", "conversation:updated", "unread:update"],
    () => void loadConversations()
  );

  useEffect(() => {
    const unsub = subscribeRealtime("typing:update", (payload) => {
      const p = payload as {
        conversationId?: string;
        isTyping?: boolean;
        typing?: boolean;
      };
      const id = p?.conversationId;
      if (!id) return;
      const on = Boolean(p.isTyping ?? p.typing);
      setTypingMap((prev) => {
        if (Boolean(prev[id]) === on) return prev;
        return { ...prev, [id]: on };
      });
    });
    return () => {
      unsub();
    };
  }, []);

  const visible = useMemo(() => {
    return items.filter((c) => {
      const id = rowId(c);
      return id && !hidden.has(id);
    });
  }, [items, hidden]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = visible;
    if (filter === "unread") {
      list = list.filter((c) => (c.unreadCount ?? 0) > 0);
    } else if (filter === "pinned") {
      list = list.filter((c) => pinned.has(rowId(c)));
    }
    if (q) {
      list = list.filter((c) => {
        const name = (c.profile?.name ?? c.peerName ?? c.title ?? "").toLowerCase();
        const preview = (c.lastMessage ?? "").toLowerCase();
        return name.includes(q) || preview.includes(q);
      });
    }
    const pinnedRows: ConversationRow[] = [];
    const rest: ConversationRow[] = [];
    for (const c of list) {
      const id = rowId(c);
      if (id && pinned.has(id)) pinnedRows.push(c);
      else rest.push(c);
    }
    return [...pinnedRows, ...rest];
  }, [visible, query, filter, pinned]);

  const unreadCount = visible.reduce(
    (n, c) => n + ((c.unreadCount ?? 0) > 0 ? 1 : 0),
    0
  );
  const pinnedCount = visible.reduce(
    (n, c) => n + (pinned.has(rowId(c)) ? 1 : 0),
    0
  );

  function togglePin(id: string) {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveIdSet(PINNED_KEY, next);
      return next;
    });
    void hapticLight();
  }

  function toggleMute(id: string) {
    setMuted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveIdSet(MUTED_KEY, next);
      return next;
    });
    setOpenSwipeId(null);
    void hapticLight();
  }

  async function archiveConversation(c: ConversationRow) {
    const id = rowId(c);
    if (!id || busyId) return;
    setBusyId(id);
    try {
      if (c.matchId) {
        await matching.archiveMatch(c.matchId, true);
      }
      setHidden((prev) => {
        const next = new Set(prev).add(id);
        saveIdSet(HIDDEN_KEY, next);
        return next;
      });
      setItems((prev) => prev.filter((row) => rowId(row) !== id));
      setOpenSwipeId(null);
      await hapticMedium();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t("chatPage.actionFailed"));
    } finally {
      setBusyId(null);
    }
  }

  function deleteConversation(c: ConversationRow) {
    const id = rowId(c);
    if (!id) return;
    setHidden((prev) => {
      const next = new Set(prev).add(id);
      saveIdSet(HIDDEN_KEY, next);
      return next;
    });
    setItems((prev) => prev.filter((row) => rowId(row) !== id));
    setOpenSwipeId(null);
    void hapticMedium();
  }

  return (
    <ScreenContainer className="wa-inbox" aria-label={t("chatPage.messages")}>
      <PageTitle title={t("chatPage.messages")} />

      <SearchField
        value={query}
        onChange={setQuery}
        placeholder={t("chatPage.searchConversations")}
        aria-label={t("chatPage.searchConversations")}
      />

      <div className="wa-filters" role="toolbar" aria-label={t("chatPage.filters")}>
        <FilterChip
          active={filter === "all"}
          onClick={() => setFilter("all")}
          count={visible.length}
        >
          {t("chatPage.all")}
        </FilterChip>
        <FilterChip
          active={filter === "unread"}
          onClick={() => setFilter("unread")}
          count={unreadCount}
        >
          {t("chatPage.unread")}
        </FilterChip>
        <FilterChip
          active={filter === "pinned"}
          onClick={() => setFilter("pinned")}
          count={pinnedCount}
        >
          {t("chatPage.pinned")}
        </FilterChip>
      </div>

      {loading && <SkeletonCard />}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}

      {!loading && filtered.length === 0 ? (
        <EmptyState
          icon={<MessageCircle size={22} />}
          title={
            query || filter !== "all"
              ? t("chatPage.noMatchSearch")
              : t("chatPage.noMessages")
          }
          body={
            query || filter !== "all"
              ? t("chatPage.noMatchSearchDesc")
              : t("chatPage.noMessagesDesc")
          }
          action={
            <Link to="/discover" className="btn btn-primary">
              {t("chatPage.openDiscover")}
            </Link>
          }
        />
      ) : (
        <ul className="wa-list" role="list">
          {filtered.map((c) => {
            const id = rowId(c);
            if (!id) return null;
            const name =
              c.profile?.name ?? c.peerName ?? c.title ?? t("chatPage.conversation");
            const imageUrl = c.profile?.imageUrl ?? null;
            const when = c.lastMessageAt ?? c.updatedAt;
            const isPinned = pinned.has(id);
            const isMuted = muted.has(id);
            const unread = c.unreadCount ?? 0;
            const isTyping = Boolean(typingMap[id]);
            const open = openSwipeId === id;

            return (
              <SwipeConversationRow
                key={id}
                open={open}
                onOpenChange={(next) => setOpenSwipeId(next ? id : null)}
                onArchive={() => void archiveConversation(c)}
                onMute={() => toggleMute(id)}
                onDelete={() => deleteConversation(c)}
                labels={{
                  archive: t("chatPage.archive"),
                  mute: isMuted ? t("chatPage.unmute") : t("chatPage.mute"),
                  delete: t("chatPage.delete"),
                }}
                muted={isMuted}
              >
                <div
                  role="link"
                  tabIndex={0}
                  className={cn("wa-row", unread > 0 && "is-unread", isPinned && "is-pinned")}
                  onClick={() => {
                    if (open) {
                      setOpenSwipeId(null);
                      return;
                    }
                    navigate(`/messages/${id}`);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (open) setOpenSwipeId(null);
                      else navigate(`/messages/${id}`);
                    }
                  }}
                >
                  <Avatar
                    src={imageUrl}
                    name={name}
                    size="lg"
                    online={Boolean(c.online)}
                  />
                  <div className="wa-row-copy">
                    <div className="wa-row-top">
                      <p className="wa-row-name">{name}</p>
                      <span className={cn("wa-row-time", unread > 0 && "is-unread")}>
                        {formatWhen(when, locale)}
                      </span>
                    </div>
                    <div className="wa-row-bottom">
                      <p className={cn("wa-row-preview", isTyping && "is-typing")}>
                        {isTyping
                          ? t("chatPage.typing")
                          : previewText(c.lastMessage, t("chatPage.noMessages"))}
                      </p>
                      <div className="wa-row-badges">
                        {isPinned ? (
                          <Pin
                            size={12}
                            className="wa-pin"
                            fill="currentColor"
                            aria-label={t("chatPage.pinned")}
                          />
                        ) : null}
                        {isMuted ? (
                          <BellOff
                            size={12}
                            className="wa-mute"
                            aria-label={t("chatPage.muted")}
                          />
                        ) : null}
                        {unread > 0 ? (
                          <span
                            className="wa-unread"
                            aria-label={`${unread} unread`}
                          >
                            {unread > 99 ? "99+" : unread}
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="wa-pin-btn"
                            aria-label={
                              isPinned
                                ? t("chatPage.unpin")
                                : t("chatPage.pin")
                            }
                            aria-pressed={isPinned}
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePin(id);
                            }}
                          >
                            <Pin
                              size={14}
                              fill={isPinned ? "currentColor" : "none"}
                            />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </SwipeConversationRow>
            );
          })}
        </ul>
      )}
    </ScreenContainer>
  );
}

function SwipeConversationRow({
  children,
  open,
  onOpenChange,
  onArchive,
  onMute,
  onDelete,
  labels,
  muted,
}: {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onArchive: () => void;
  onMute: () => void;
  onDelete: () => void;
  labels: { archive: string; mute: string; delete: string };
  muted?: boolean;
}) {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const [drag, setDrag] = useState(0);
  const axis = useRef<"x" | "y" | null>(null);

  const offset = drag !== 0 ? drag : open ? -SWIPE_OPEN : 0;

  return (
    <li className="wa-swipe">
      <div className="wa-swipe-actions" aria-hidden={!open && drag === 0}>
        <button type="button" className="wa-action wa-action-archive" onClick={onArchive}>
          <Archive size={18} />
          <span>{labels.archive}</span>
        </button>
        <button
          type="button"
          className={cn("wa-action wa-action-mute", muted && "is-on")}
          onClick={onMute}
        >
          <BellOff size={18} />
          <span>{labels.mute}</span>
        </button>
        <button type="button" className="wa-action wa-action-delete" onClick={onDelete}>
          <Trash2 size={18} />
          <span>{labels.delete}</span>
        </button>
      </div>
      <div
        className="wa-swipe-front"
        style={{ transform: `translateX(${offset}px)` }}
        onTouchStart={(e) => {
          startX.current = e.touches[0]?.clientX ?? null;
          startY.current = e.touches[0]?.clientY ?? null;
          axis.current = null;
        }}
        onTouchMove={(e) => {
          const x = e.touches[0]?.clientX;
          const y = e.touches[0]?.clientY;
          if (startX.current == null || x == null || startY.current == null || y == null) {
            return;
          }
          const dx = x - startX.current;
          const dy = y - startY.current;
          if (!axis.current) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            axis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
          }
          if (axis.current !== "x") return;
          const base = open ? -SWIPE_OPEN : 0;
          const next = Math.min(0, Math.max(-SWIPE_OPEN, base + dx));
          setDrag(next);
        }}
        onTouchEnd={() => {
          if (axis.current === "x") {
            onOpenChange(drag < -SWIPE_ACTION || (open && drag <= -SWIPE_ACTION));
          }
          setDrag(0);
          startX.current = null;
          startY.current = null;
          axis.current = null;
        }}
      >
        {children}
      </div>
    </li>
  );
}
