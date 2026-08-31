import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Ban,
  Image as ImageIcon,
  MoreVertical,
  Paperclip,
  Send,
  ShieldAlert,
  Smile,
} from "lucide-react";
import {
  chat,
  connectRealtime,
  joinConversation,
  leaveConversation,
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

const EmojiPickerLazy = lazy(() => import("@/features/messages/EmojiPicker"));

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

function toChatList(messages: UiMessage[]): ChatListMessage[] {
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
      failed: m.failed,
      read: m.read,
      delivery: m.delivery,
      dateLabel,
    };
  });
}

export function ChatThreadPage({ conversationId }: { conversationId: string }) {
  const { user, offline } = useSession();
  const { locale, t } = useTranslation();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [peer, setPeer] = useState<{
    name: string;
    userId: string | null;
    imageUrl: string | null;
    online?: boolean;
  }>({ name: "Chat", userId: null, imageUrl: null });
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [stickToBottom, setStickToBottom] = useState(true);
  const [showJump, setShowJump] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [safetyBusy, setSafetyBusy] = useState(false);
  const [attachPreview, setAttachPreview] = useState<{
    url: string;
    file: File;
  } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const userId = user?.id ? String(user.id) : null;
  const canSend = Boolean(body.trim() || attachPreview);

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
      const locals = prev.filter((m) => m.pending || m.failed);
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
          profile?: {
            name?: string | null;
            userId?: string;
            imageUrl?: string | null;
          } | null;
          peerName?: string;
          title?: string;
          online?: boolean;
        };
        const name = c.profile?.name ?? c.peerName ?? c.title ?? "Chat";
        setPeer({
          name: String(name),
          userId: c.profile?.userId ? String(c.profile.userId) : null,
          imageUrl: c.profile?.imageUrl ?? null,
          online: Boolean(c.online),
        });
      })
      .catch(() => undefined);
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

  useEffect(() => {
    return () => {
      if (attachPreview?.url) URL.revokeObjectURL(attachPreview.url);
    };
  }, [attachPreview]);

  function insertEmoji(emoji: string) {
    const el = textareaRef.current;
    if (!el) {
      setBody((b) => b + emoji);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + emoji + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (sending || offline) return;
    const text = body.trim();
    const pendingFile = attachPreview?.file;
    if (!text && !pendingFile) return;
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
          message: text || undefined,
          imageUrl: attachPreview?.url,
          mine: true,
          pending: true,
          createdAt: Date.now(),
        },
      ])
    );
    setStickToBottom(true);
    try {
      let imageMediaId: string | undefined;
      if (pendingFile) {
        setUploadProgress(t("chatPage.uploading"));
        const uploaded = await chat.uploadChatImage(conversationId, pendingFile);
        imageMediaId = uploaded.mediaId;
        setUploadProgress(null);
        if (attachPreview?.url) URL.revokeObjectURL(attachPreview.url);
        setAttachPreview(null);
      }
      await chat.sendMessage(conversationId, {
        message: text || undefined,
        imageMediaId,
        idempotencyKey: `${conversationId}-${tempId}`,
      });
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
      setUploadProgress(null);
    } finally {
      setSending(false);
    }
  }

  async function retry(id: string) {
    const m = messages.find((x) => messageKey(x, 0) === id || x.id === id);
    if (!m) return;
    const text = String(m.message ?? m.body ?? m.text ?? "");
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    setBody(text);
  }

  async function attachImage(source: "camera" | "library") {
    setAttachOpen(false);
    try {
      const { pickProfilePhoto } = await import("@/platform/camera");
      const picked = await pickProfilePhoto(source);
      const file = new File([picked.blob], picked.fileName, {
        type: picked.contentType,
      });
      if (attachPreview?.url) URL.revokeObjectURL(attachPreview.url);
      setAttachPreview({ url: URL.createObjectURL(file), file });
    } catch (e) {
      setError(userFacingError(e));
    }
  }

  const list = useMemo(() => toChatList(messages), [messages]);

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
      <header className="screen-header wa-chat-header">
        <Link to="/messages" className="back-btn" aria-label={t("common.back")}>
          ←
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
          className="btn btn-ghost wa-chat-more"
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
            className="btn btn-danger btn-block"
            disabled={safetyBusy || offline || !peer.userId}
            onClick={() => void reportOrBlock("block")}
          >
            <Ban size={16} /> {t("safety.blockUser")}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet
        open={attachOpen}
        title={t("chatPage.attach")}
        onClose={() => setAttachOpen(false)}
      >
        <div className="stack">
          <button
            type="button"
            className="btn btn-secondary btn-block"
            disabled={offline || sending}
            onClick={() => void attachImage("library")}
          >
            <ImageIcon size={16} /> {t("chatPage.photoLibrary")}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            disabled={offline || sending}
            onClick={() => void attachImage("camera")}
          >
            <ImageIcon size={16} /> {t("chatPage.camera")}
          </button>
        </div>
      </BottomSheet>

      {offline && (
        <div className="form-error" role="status">
          {t("chatPage.offlineDraft")}
        </div>
      )}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {uploadProgress && (
        <p className="muted small center" role="status">
          {uploadProgress}
        </p>
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
      />

      {attachPreview && (
        <div className="attach-preview">
          <img src={attachPreview.url} alt="" />
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              URL.revokeObjectURL(attachPreview.url);
              setAttachPreview(null);
            }}
          >
            {t("common.remove")}
          </button>
        </div>
      )}

      <form
        className="composer wa-composer"
        onSubmit={(e) => void send(e)}
      >
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label={t("chatPage.attach")}
          disabled={offline || sending}
          onClick={() => setAttachOpen(true)}
        >
          <Paperclip size={18} />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label={t("chatPage.emoji")}
          onClick={() => setEmojiOpen(true)}
        >
          <Smile size={18} />
        </button>
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
          className="btn btn-primary btn-icon"
          disabled={sending || offline || !canSend}
          aria-label={t("chatPage.send")}
        >
          <Send size={18} />
        </button>
      </form>

      <Suspense fallback={null}>
        <EmojiPickerLazy
          open={emojiOpen}
          locale={locale === "so" ? "so" : "en"}
          onClose={() => setEmojiOpen(false)}
          onPick={(emoji) => {
            insertEmoji(emoji);
            setEmojiOpen(false);
          }}
          title={t("chatPage.emoji")}
          recentLabel={locale === "so" ? "Dhawaan" : "Recent"}
          searchLabel={locale === "so" ? "Raadi" : "Search"}
        />
      </Suspense>
    </div>
  );
}
