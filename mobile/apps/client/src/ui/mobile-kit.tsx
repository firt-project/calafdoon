import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Network } from "@capacitor/network";
import { Capacitor } from "@capacitor/core";

export function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  const [reconnected, setReconnected] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    const apply = (connected: boolean) => {
      if (!connected) {
        wasOffline.current = true;
        setOffline(true);
        setReconnected(false);
      } else {
        setOffline(false);
        if (wasOffline.current) {
          setReconnected(true);
          wasOffline.current = false;
          window.setTimeout(() => setReconnected(false), 3200);
        }
      }
    };
    const sync = () => apply(navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);

    let remove: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      void Network.getStatus().then((s) => apply(s.connected));
      void Network.addListener("networkStatusChange", (s) => {
        apply(s.connected);
      }).then((h) => {
        remove = () => {
          void h.remove();
        };
      });
    }

    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      remove?.();
    };
  }, []);

  if (offline) {
    return (
      <div className="offline-banner" role="status" aria-live="polite">
        You are offline — likes, messages, uploads, and payments need a connection
      </div>
    );
  }
  if (reconnected) {
    return (
      <div className="offline-banner reconnected" role="status" aria-live="polite">
        Back online
      </div>
    );
  }
  return null;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <h2 style={{ margin: 0, fontSize: "1.2rem" }}>{title}</h2>
      {body && <p className="muted">{body}</p>}
      {action}
    </div>
  );
}

export function SkeletonCard() {
  return <div className="skeleton card" aria-hidden />;
}

export function BottomSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <>
      <button
        type="button"
        className="sheet-backdrop"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-dialog-open="true"
      >
        <div className="sheet-handle" />
        <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.15rem" }}>{title}</h2>
        <div className="sheet-body">{children}</div>
      </div>
    </>,
    document.body
  );
}
