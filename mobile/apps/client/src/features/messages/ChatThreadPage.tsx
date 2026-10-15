import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Ban, MoreVertical, Send, ShieldAlert } from "lucide-react";
import {
  apiClient,
  chat,
  connectRealtime,
  joinConversation,
  leaveConversation,
  matching,
  moderation,
  subscribeRealtime,
} from "@hel/api-client";
import { useSession } from "@/features/auth/SessionProvider";
import { hapticError, hapticLight, hapticMedium } from "@/platform/haptics";
import { userFacingError } from "@/platform/errors";
import {
  VirtualizedMessageList,
  type ChatListMessage,
} from "@/features/messages/VirtualizedMessageList";
import { PeerProfileSheet } from "@/features/profile/PeerProfileSheet";
import {
  clearChatDraft,
  loadChatDraft,
  rememberDraftConversation,
  saveChatDraft,
} from "@/platform/chat-drafts";
import { useTranslation } from "@/lib/i18n/context";
import { BottomSheet } from "@/ui/mobile-kit";
import { Avatar } from "@/ui/design-system";
import { cn } from "@/utils/cn";

type UiMessage = {
  id?: string;
  _id?: string;
  body?: string;
  text?: string;
  message?: string;
  senderId?: string;
  mine?: boolean;
  senderIsMe?: boolean;
  createdAt?: number | string;
  delivery?: string;
  read?: boolean;
  failed?: boolean;
  pending?: boolean;
  deleted?: boolean;
  edited?: boolean;
  replyTo?: { senderId: string; text: string; deleted: boolean; hasImage: boolean } | null;
  imageUrl?: string | null;
  imageMediaId?: string;
};

function normalizeMessage(raw: UiMessage, myUserId: string | null): UiMessage {
  const senderId = raw.senderId ? String(raw.senderId) : undefined;
  const mine =
    raw.mine === true ||
    raw.senderIsMe === true ||
    (myUserId != null && senderId != null && senderId === myUserId);
  return { ...raw, senderId, mine };
}

function messageKey(m: UiMessage, index: number): string {
  return String(m._id ?? m.id ?? `idx-${index}`);
}

function dedupeMessages(list: UiMessage[]): UiMessage[] {
  const seen = new Set<string>();
  const out: UiMessage[] = [];
  list.forEach((m, i) => {
    const key = messageKey(m, i);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(m);
  });
  return out;
}

function toChatList(messages: UiMessage[], userId: string | null): ChatListMessage[] {
  let lastDay = "";
  return messages.map((m, i) => {
    const created = m.createdAt ? new Date(m.createdAt) : null;
    const day =
      created && !Number.isNaN(created.getTime())
        ? created.toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
          })
        : "";
    const dateLabel = day && day !== lastDay ? day : undefined;
    if (day) lastDay = day;
    return {
      id: messageKey(m, i),
      text: m.message ?? m.body ?? m.text,
      imageUrl: m.imageUrl,
      mine: Boolean(m.mine),
      createdAt: m.createdAt,
      pending: m.pending,
      deleted: m.deleted,
      edited: m.edited,
      replyTo: m.replyTo
        ? {
            text: m.replyTo.text,
            deleted: m.replyTo.deleted,
            hasImage: m.replyTo.hasImage,
            mine: userId != null && m.replyTo.senderId === userId,
          }
        : null,
      failed: m.failed,
      read: m.read,
      delivery: m.delivery,
      dateLabel,
    };
  });
}

export function ChatThreadPage({ conversationId }: { conversationId: string }) {
  const { user, offline } = useSession();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [peer, setPeer] = useState<{
    name: string;
    userId: string | null;
    imageUrl: string | null;
    online?: boolean;
  }>({ name: "Chat", userId: null, imageUrl: null });
  const [matchId, setMatchId] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [unmatchOpen, setUnmatchOpen] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [stickToBottom, setStickToBottom] = useState(true);
  const [showJump, setShowJump] = useState(false);
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [safetyBusy, setSafetyBusy] = useState(false);
  const [menuMessageId, setMenuMessageId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<UiMessage | null>(null);
  const [editing, setEditing] = useState<UiMessage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const userId = user?.id ? String(user.id) : null;
  const canSend = Boolean(body.trim());

  async function loadMessages() {
    const data = await chat.getMessages(conversationId);
    const list = Array.isArray(data)
      ? data
      : data && typeof data === "object" && "items" in data
        ? (data as { items: UiMessage[] }).items
        : [];
    const normalized = (list as UiMessage[]).map((m) =>
      normalizeMessage(m, userId)
    );
    setMessages((prev) => {
      // A pending local copy is replaced by the server message with the same text.
      const claimed = new Set<string>();
      const locals = prev.filter((m) => {
        if (m.failed) return true;
        if (!m.pending) return false;
        const text = String(m.message ?? "");
        const since = Number(m.createdAt ?? 0) - 10_000;
        const twin = normalized.find(
          (n) =>
            n.mine &&
            !claimed.has(messageKey(n, 0)) &&
            String(n.message ?? n.body ?? n.text ?? "") === text &&
            new Date(n.createdAt ?? 0).getTime() >= since
        );
        if (twin) claimed.add(messageKey(twin, 0));
        return !twin;
      });
      return dedupeMessages([...normalized, ...locals]);
    });
    try {
      await chat.markAsRead(conversationId);
    } catch {
      /* optional */
    }
  }

  useEffect(() => {
    let alive = true;
    chat
      .getConversation(conversationId)
      .then((raw) => {
        if (!alive || !raw || typeof raw !== "object") return;
        const c = raw as {
          matchId?: string;
          profile?: {
            name?: string | null;
            userId?: string;
            imageUrl?: string | null;
          } | null;
          peerName?: string;
          title?: string;
          online?: boolean;
        };
        if (c.matchId) setMatchId(String(c.matchId));
        const name = c.profile?.name ?? c.peerName ?? c.title ?? "Chat";
        setPeer({
          name: String(name),
          userId: c.profile?.userId ? String(c.profile.userId) : null,
          imageUrl: c.profile?.imageUrl ?? null,
          online: Boolean(c.online),
        });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [conversationId]);

  useEffect(() => {
    let alive = true;
    setStickToBottom(true);
    loadMessages().catch((e) => {
      if (alive) setError(userFacingError(e));
    });
    if (userId) {
      void loadChatDraft(userId, conversationId).then((draft) => {
        if (alive && draft) setBody(draft);
      });
      void rememberDraftConversation(userId, conversationId);
    }
    connectRealtime();
    joinConversation(conversationId);
    const unsubMsg = subscribeRealtime("message:new", (payload) => {
      const p = payload as { conversationId?: string } | undefined;
      if (p?.conversationId && p.conversationId !== conversationId) return;
      if (alive) void loadMessages();
    });
    const unsubDeleted = subscribeRealtime("message:deleted", (payload) => {
      const p = payload as { conversationId?: string } | undefined;
      if (p?.conversationId && p.conversationId !== conversationId) return;
      if (alive) void loadMessages();
    });
    const unsubEdited = subscribeRealtime("message:edited", (payload) => {
      const p = payload as { conversationId?: string } | undefined;
      if (p?.conversationId && p.conversationId !== conversationId) return;
      if (alive) void loadMessages();
    });
    const unsubTyping = subscribeRealtime("typing:update", (payload) => {
      const p = payload as {
        conversationId?: string;
        isTyping?: boolean;
        typing?: boolean;
      };
      if (p?.conversationId && p.conversationId !== conversationId) return;
      if (alive) setTyping(Boolean(p?.isTyping ?? p?.typing));
    });
    const tick = window.setInterval(() => {
      chat
        .getTypingStatus(conversationId)
        .then((s) => {
          const typingNow =
            s && typeof s === "object"
              ? Boolean(
                  (s as { typing?: boolean; isTyping?: boolean }).typing ??
                    (s as { isTyping?: boolean }).isTyping
                )
              : false;
          if (alive) setTyping(typingNow);
        })
        .catch(() => undefined);
    }, 4000);
    return () => {
      alive = false;
      unsubMsg();
      unsubDeleted();
      unsubEdited();
      unsubTyping();
      leaveConversation(conversationId);
      window.clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, userId]);

  useEffect(() => {
    if (!userId) return;
    const handle = window.setTimeout(() => {
      void saveChatDraft(userId, conversationId, body);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [body, conversationId, userId]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (sending || offline) return;
    const text = body.trim();
    if (!text) return;
    if (editing) {
      const target = editing;
      setSending(true);
      setError(null);
      try {
        await chat.editMessage(conversationId, messageKey(target, 0), text);
        setEditing(null);
        setBody("");
        if (userId) await clearChatDraft(userId, conversationId);
        await loadMessages();
      } catch (err) {
        setError(userFacingError(err));
      } finally {
        setSending(false);
      }
      return;
    }
    const replyId = replyTo ? messageKey(replyTo, 0) : undefined;
    setReplyTo(null);
    const tempId = `local-${Date.now()}`;
    setSending(true);
    setError(null);
    setBody("");
    if (userId) await clearChatDraft(userId, conversationId);
    setMessages((prev) =>
      dedupeMessages([
        ...prev,
        {
          id: tempId,
          message: text,
          mine: true,
          pending: true,
          createdAt: Date.now(),
        },
      ])
    );
    setStickToBottom(true);
    try {
      await chat.sendMessage(conversationId, {
        message: text,
        idempotencyKey: `${conversationId}-${tempId}`,
        replyToId: replyId,
      });
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      await hapticLight();
      await loadMessages();
    } catch (err) {
      await hapticError();
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, pending: false, failed: true } : m
        )
      );
      setBody(text);
      if (userId) await saveChatDraft(userId, conversationId, text);
      setError(userFacingError(err));
    } finally {
      setSending(false);
    }
  }

  async function deleteMine() {
    const id = menuMessageId;
    if (!id || deleting) return;
    setDeleting(true);
    try {
      await chat.deleteMessage(conversationId, id);
      setMessages((prev) =>
        prev.map((m) =>
          messageKey(m, 0) === id ? { ...m, deleted: true } : m
        )
      );
      await hapticLight();
    } catch (err) {
      await hapticError();
      setError(userFacingError(err));
    } finally {
      setDeleting(false);
      setMenuMessageId(null);
    }
  }

  async function retry(id: string) {
    const m = messages.find((x) => messageKey(x, 0) === id || x.id === id);
    if (!m) return;
    const text = String(m.message ?? m.body ?? m.text ?? "");
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    setBody(text);
  }

  const list = useMemo(() => toChatList(messages, userId), [messages, userId]);

  useEffect(() => {
    apiClient
      .get<{ muted: boolean }>(`/conversations/${encodeURIComponent(conversationId)}/mute`)
      .then((r) => setMuted(Boolean(r?.muted)))
      .catch(() => undefined);
  }, [conversationId]);

  async function toggleMute() {
    const next = !muted;
    setMuted(next);
    try {
      await apiClient.post(`/conversations/${encodeURIComponent(conversationId)}/mute`, { muted: next });
    } catch {
      setMuted(!next);
    }
  }

  async function unmatchUser() {
    if (!matchId || safetyBusy || offline) return;
    setSafetyBusy(true);
    setError(null);
    try {
      await matching.unmatch(matchId);
      await hapticMedium();
      setUnmatchOpen(false);
      setSafetyOpen(false);
      navigate("/messages", { replace: true });
    } catch (e) {
      await hapticError();
      setUnmatchOpen(false);
      setError(userFacingError(e));
    } finally {
      setSafetyBusy(false);
    }
  }

  async function reportOrBlock(kind: "report" | "block") {
    const targetId = peer.userId;
    if (!targetId || safetyBusy || offline) return;
    setSafetyBusy(true);
    setError(null);
    try {
      if (kind === "block") {
        await moderation.blockUser(targetId);
        await hapticMedium();
        setSafetyOpen(false);
        setPartnerOpen(false);
        navigate("/messages", { replace: true });
        return;
      }
      await moderation.reportUser({
        userId: targetId,
        reason: "other",
        details: t("safety.reportFromChat", { name: peer.name }),
      });
      await hapticMedium();
      setSafetyOpen(false);
      setPartnerOpen(false);
    } catch (e) {
      await hapticError();
      setError(userFacingError(e));
    } finally {
      setSafetyBusy(false);
    }
  }

  const statusLabel = typing
    ? t("chatPage.typing")
    : peer.online
      ? t("chatPage.activeNow")
      : t("chatPage.tapForInfo");

  return (
    <div className="screen chat-screen wa-chat">
      <div className="wa-chat-canvas" aria-hidden />

      <header className="screen-header wa-chat-header">
        <Link
          to="/messages"
          className="wa-chat-icon-btn"
          aria-label={t("common.back")}
        >
          <ArrowLeft size={20} />
        </Link>
        <button
          type="button"
          className="wa-chat-peer"
          aria-label={`${peer.name} — ${t("homeFeed.viewProfile")}`}
          onClick={() => setPartnerOpen(true)}
        >
          <Avatar src={peer.imageUrl} name={peer.name} size="md" online={peer.online} />
          <span className="wa-chat-peer-meta">
            <strong>{peer.name}</strong>
            <span className={cn("wa-chat-status", typing && "is-typing")}>
              {statusLabel}
            </span>
          </span>
        </button>
        <button
          type="button"
          className="wa-chat-icon-btn"
          aria-label={t("safety.reportOrBlock")}
          disabled={!peer.userId || offline}
          onClick={() => setSafetyOpen(true)}
        >
          <MoreVertical size={18} />
        </button>
      </header>

      <PeerProfileSheet
        open={partnerOpen}
        onClose={() => setPartnerOpen(false)}
        title={peer.name || t("homeFeed.viewProfile")}
        seed={{
          name: peer.name,
          userId: peer.userId ?? undefined,
          imageUrl: peer.imageUrl,
        }}
        source={{
          type: "chat",
          conversationId,
          userId: peer.userId,
        }}
        footer={
          peer.userId ? (
            <div className="stack" style={{ gap: "0.5rem" }}>
              <button
                type="button"
                className="btn btn-secondary btn-block"
                disabled={safetyBusy || offline}
                onClick={() => setSafetyOpen(true)}
              >
                <ShieldAlert size={16} /> {t("safety.reportOrBlock")}
              </button>
            </div>
          ) : null
        }
      />

      <BottomSheet
        open={safetyOpen}
        title={t("safety.reportOrBlock")}
        onClose={() => setSafetyOpen(false)}
      >
        <div className="stack">
          <p className="muted small" style={{ margin: 0 }}>
            {t("chatPage.safetyReminder")}
          </p>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            disabled={safetyBusy || offline || !peer.userId}
            onClick={() => void reportOrBlock("report")}
          >
            <ShieldAlert size={16} /> {t("safety.reportUser")}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            disabled={offline}
            onClick={() => void toggleMute()}
          >
            {muted ? "Unmute notifications" : "Mute notifications"}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            disabled={safetyBusy || offline || !matchId}
            onClick={() => {
              setSafetyOpen(false);
              setUnmatchOpen(true);
            }}
          >
            Unmatch
          </button>
          <button
            type="button"
            className="btn btn-danger btn-block"
            disabled={safetyBusy || offline || !peer.userId}
            onClick={() => void reportOrBlock("block")}
          >
            <Ban size={16} /> {t("safety.blockUser")}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet
        open={unmatchOpen}
        title={`Unmatch with ${peer.name}?`}
        onClose={() => setUnmatchOpen(false)}
      >
        <div className="stack">
          <p className="muted small" style={{ margin: 0 }}>
            You will no longer be able to chat with {peer.name}, and the
            conversation will disappear for both of you.
          </p>
          <button
            type="button"
            className="btn btn-danger btn-block"
            disabled={safetyBusy || offline}
            onClick={() => void unmatchUser()}
          >
            {safetyBusy ? "Unmatching…" : "Yes, unmatch"}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            onClick={() => setUnmatchOpen(false)}
          >
            Cancel
          </button>
        </div>
      </BottomSheet>

      {offline && (
        <div className="form-notice" role="status">
          {t("chatPage.offlineDraft")}
        </div>
      )}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}

      <VirtualizedMessageList
        messages={list}
        stickToBottom={stickToBottom}
        onStickChange={(stuck) => {
          setStickToBottom(stuck);
          if (stuck) setShowJump(false);
        }}
        showJump={showJump && !stickToBottom}
        newMessagesLabel={t("chatPage.newMessages")}
        onJumpNewest={() => {
          setStickToBottom(true);
          setShowJump(false);
        }}
        onRetry={(id) => void retry(id)}
        onMessageMenu={(id) => setMenuMessageId(id)}
      />
      <BottomSheet
        open={menuMessageId != null}
        onClose={() => setMenuMessageId(null)}
        title="Message"
      >
        {(() => {
          const target = messages.find((m) => messageKey(m, 0) === menuMessageId);
          if (!target) return null;
          const text = String(target.message ?? target.body ?? target.text ?? "");
          const mine = Boolean(target.mine);
          const created = target.createdAt ? new Date(target.createdAt).getTime() : 0;
          const canEdit =
            mine && !target.imageUrl && Date.now() - created < 15 * 60 * 1000;
          return (
            <div className="stack">
              <button
                type="button"
                className="btn btn-secondary btn-block"
                onClick={() => {
                  setEditing(null);
                  setReplyTo(target);
                  setMenuMessageId(null);
                  textareaRef.current?.focus();
                }}
              >
                Reply
              </button>
              {canEdit && (
                <button
                  type="button"
                  className="btn btn-secondary btn-block"
                  onClick={() => {
                    setReplyTo(null);
                    setEditing(target);
                    setBody(text);
                    setMenuMessageId(null);
                    textareaRef.current?.focus();
                  }}
                >
                  Edit
                </button>
              )}
              {mine && (
                <button
                  type="button"
                  className="btn btn-danger btn-block"
                  disabled={deleting}
                  onClick={() => void deleteMine()}
                >
                  {deleting ? "Deleting…" : "Delete for everyone"}
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary btn-block"
                onClick={() => setMenuMessageId(null)}
              >
                Cancel
              </button>
            </div>
          );
        })()}
      </BottomSheet>

      {(replyTo || editing) && (
        <div
          className="form-notice"
          role="status"
          style={{ display: "flex", alignItems: "center", gap: "0.5rem", justifyContent: "space-between" }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {editing ? "Editing message" : "Replying to"}
            {": "}
            {String((editing ?? replyTo)?.message ?? (editing ?? replyTo)?.body ?? "").slice(0, 80) || "Photo"}
          </span>
          <button
            type="button"
            className="linkish"
            aria-label="Cancel"
            onClick={() => {
              if (editing) setBody("");
              setEditing(null);
              setReplyTo(null);
            }}
          >
            ✕
          </button>
        </div>
      )}

      <form className="composer wa-composer" onSubmit={(e) => void send(e)}>
        <textarea
          ref={textareaRef}
          value={body}
          rows={1}
          className="composer-input"
          onChange={(e) => {
            const next = e.target.value;
            setBody(next);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(120, e.target.scrollHeight)}px`;
            void chat
              .setTyping(conversationId, next.trim().length > 0)
              .catch(() => undefined);
          }}
          onBlur={() => {
            void chat.setTyping(conversationId, false).catch(() => undefined);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={t("chatPage.typeMessage")}
          aria-label={t("chatPage.typeMessage")}
          enterKeyHint="send"
        />
        <button
          type="submit"
          className="wa-send-btn"
          disabled={sending || offline || !canSend}
          aria-label={t("chatPage.send")}
        >
          <Send size={16} />
          <span>{t("chatPage.send")}</span>
        </button>
      </form>
    </div>
  );
}
