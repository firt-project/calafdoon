import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  intentFromDeltaX,
  rotationFromDeltaX,
  shouldCommitSwipe,
  swipeThresholdPx,
  type SwipeIntent,
} from "@/platform/swipe";
import { hapticMedium } from "@/platform/haptics";

type Props = {
  children: ReactNode;
  disabled?: boolean;
  onCommit: (intent: "like" | "pass") => void | Promise<void>;
  className?: string;
  likeLabel: string;
  passLabel: string;
};

export function SwipeableCard({
  children,
  disabled,
  onCommit,
  className,
  likeLabel,
  passLabel,
}: Props) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState<SwipeIntent>(null);
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const crossed = useRef(false);
  const pending = useRef(false);

  const reset = useCallback(() => {
    setDx(0);
    setDy(0);
    setDragging(false);
    setExiting(null);
    crossed.current = false;
    start.current = null;
  }, []);

  const width = () => cardRef.current?.offsetWidth ?? 320;

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || pending.current || exiting) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current || disabled || pending.current) return;
    const nextDx = e.clientX - start.current.x;
    const nextDy = e.clientY - start.current.y;
    // Prefer horizontal; ignore mostly-vertical for pull-to-refresh coexistence
    if (!dragging && Math.abs(nextDy) > Math.abs(nextDx) && Math.abs(nextDy) > 12) {
      return;
    }
    setDx(nextDx);
    setDy(nextDy * 0.25);
    const threshold = swipeThresholdPx(width());
    const intent = intentFromDeltaX(nextDx, threshold);
    if (intent && !crossed.current) {
      crossed.current = true;
      void hapticMedium();
    }
    if (!intent) crossed.current = false;
  };

  const finish = async (intent: SwipeIntent) => {
    if (!intent) {
      reset();
      return;
    }
    pending.current = true;
    setExiting(intent);
    setDx(intent === "like" ? width() * 1.4 : -width() * 1.4);
    try {
      await onCommit(intent);
    } finally {
      pending.current = false;
      reset();
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!start.current || disabled) {
      reset();
      return;
    }
    const elapsed = Math.max(16, Date.now() - start.current.t);
    const velocityX = (e.clientX - start.current.x) / elapsed;
    const threshold = swipeThresholdPx(width());
    const intent = shouldCommitSwipe(dx, velocityX, threshold);
    void finish(intent);
  };

  const rotation = rotationFromDeltaX(dx, width());
  const threshold = swipeThresholdPx(width());
  const likeOpacity = Math.min(1, Math.max(0, dx / threshold));
  const passOpacity = Math.min(1, Math.max(0, -dx / threshold));

  return (
    <div
      ref={cardRef}
      className={className}
      style={{
        transform: `translate3d(${dx}px, ${dy}px, 0) rotate(${rotation}deg)`,
        transition: dragging ? "none" : "transform 220ms ease",
        touchAction: "pan-y",
        willChange: "transform",
        userSelect: "none",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={reset}
      role="group"
      aria-roledescription="swipeable profile card"
    >
      <div
        className="swipe-stamp like"
        style={{ opacity: likeOpacity }}
        aria-hidden
      >
        {likeLabel}
      </div>
      <div
        className="swipe-stamp pass"
        style={{ opacity: passOpacity }}
        aria-hidden
      >
        {passLabel}
      </div>
      {children}
    </div>
  );
}
