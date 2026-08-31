"use client";

import { cn } from "@/lib/utils";

type OnlineDotProps = {
  online?: boolean;
  /** Show a muted offline ring when not online (messages list style). */
  showOffline?: boolean;
  className?: string;
  size?: "sm" | "md";
};

/** Corner status dot for avatars — sit outside Avatar (overflow-hidden). */
export function OnlineDot({
  online = false,
  showOffline = true,
  className,
  size = "md",
}: OnlineDotProps) {
  if (!online && !showOffline) return null;
  return (
    <span
      className={cn(
        "absolute bottom-0 right-0 rounded-full ring-2 ring-background",
        size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3",
        online ? "bg-emerald-500" : "bg-muted-foreground/45",
        className
      )}
      aria-hidden
    />
  );
}

type OnlineBadgeProps = {
  online?: boolean;
  label: string;
  className?: string;
  /** Dark pill for photos (discover) vs green text under name (profile). */
  variant?: "pill" | "text";
};

export function OnlineBadge({
  online = false,
  label,
  className,
  variant = "pill",
}: OnlineBadgeProps) {
  if (!online) return null;

  if (variant === "text") {
    return (
      <p
        className={cn(
          "mt-1.5 flex items-center gap-1.5 text-sm font-medium text-emerald-600",
          className
        )}
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
        {label}
      </p>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm shadow-sm",
        className
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" aria-hidden />
      {label}
    </span>
  );
}
