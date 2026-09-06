import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Check, CheckCheck, Clock } from "lucide-react";
import { cn } from "@/utils/cn";

export type ChatListMessage = {
  id: string;
  text?: string;
  imageUrl?: string | null;
  mine: boolean;
  createdAt?: number | string;
  pending?: boolean;
  failed?: boolean;
  read?: boolean;
  delivery?: string;
  dateLabel?: string;
};

type Props = {
  messages: ChatListMessage[];
  onRetry?: (id: string) => void;
  onLoadOlder?: () => void;
  hasOlder?: boolean;
  loadingOlder?: boolean;
  stickToBottom: boolean;
  onStickChange: (stuck: boolean) => void;
  newMessagesLabel: string;
  onJumpNewest: () => void;
  showJump: boolean;
};

function timeLabel(m: ChatListMessage): string {
  if (!m.createdAt) return "";
  const d = new Date(m.createdAt);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function Receipt({ m }: { m: ChatListMessage }) {
  if (m.pending) return <Clock size={12} strokeWidth={2.5} />;
  if (m.read) return <CheckCheck size={13} strokeWidth={2.5} />;
  if (m.delivery === "delivered") return <CheckCheck size={13} strokeWidth={2.5} />;
  return <Check size={13} strokeWidth={2.5} />;
}

export function VirtualizedMessageList({
  messages,
  onRetry,
  onLoadOlder,
  hasOlder,
  loadingOlder,
  stickToBottom,
  onStickChange,
  newMessagesLabel,
  onJumpNewest,
  showJump,
}: Props) {
  const parentRef = useRef<HTMLDivElement | null>(null);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 12,
    getItemKey: (index) => messages[index]?.id ?? index,
  });

  useEffect(() => {
    if (!stickToBottom || messages.length === 0) return;
    virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
  }, [messages.length, stickToBottom, virtualizer]);

  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
      <div
        ref={parentRef}
        className="chat-thread"
        aria-live="polite"
        onScroll={() => {
          const el = parentRef.current;
          if (!el) return;
          const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
          const stuck = distance < 80;
          onStickChange(stuck);
          if (el.scrollTop < 80 && hasOlder && !loadingOlder) {
            onLoadOlder?.();
          }
        }}
      >
        {loadingOlder && (
          <p className="muted small center" role="status">
            Loading earlier messages…
          </p>
        )}
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((row) => {
            const m = messages[row.index];
            if (!m) return null;
            return (
              <div
                key={m.id}
                data-index={row.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${row.start}px)`,
                  padding: "0.2rem 0",
                }}
              >
                {m.dateLabel && (
                  <p className="muted small center" style={{ margin: "0.5rem 0" }}>
                    {m.dateLabel}
                  </p>
                )}
                <div className={cn("bubble", m.mine ? "me" : "peer", m.failed && "failed")}>
                  {m.imageUrl ? (
                    <img
                      src={m.imageUrl}
                      alt=""
                      loading="lazy"
                      style={{
                        maxWidth: "100%",
                        borderRadius: 12,
                        display: "block",
                        marginBottom: m.text ? 6 : 0,
                      }}
                    />
                  ) : null}
                  {m.text ? <span className="bubble-text">{m.text}</span> : null}
                  <span
                    className={cn("bubble-meta", m.read && "is-read")}
                  >
                    <span className="bubble-time">{timeLabel(m)}</span>
                    {m.mine && !m.failed && (
                      <span className="bubble-receipt">
                        <Receipt m={m} />
                      </span>
                    )}
                    {m.failed && <span className="bubble-failed">Failed</span>}
                    {m.failed && onRetry && (
                      <button
                        type="button"
                        className="linkish"
                        onClick={() => onRetry(m.id)}
                      >
                        Retry
                      </button>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {showJump && (
        <button
          type="button"
          className="btn btn-secondary jump-new"
          onClick={onJumpNewest}
        >
          {newMessagesLabel}
        </button>
      )}
    </div>
  );
}
