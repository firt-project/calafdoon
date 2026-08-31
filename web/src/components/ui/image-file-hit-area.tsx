"use client";

import { useId, type ChangeEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type ImageFileHitAreaProps = {
  children: ReactNode;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  className?: string;
  /** Keep simple — long accept lists break the picker on some Android browsers. */
  accept?: string;
  "aria-label"?: string;
};

/**
 * Mobile-safe image picker (iPhone / Android / Safari / Chrome / Firefox).
 *
 * Rules that must not regress:
 * - The user must tap the real `<input type="file">` (never `.click()` from JS).
 * - Do not use `display:none`, `hidden`, or `sr-only` on the input.
 * - Do not put `overflow-hidden` on the same box as the input (clip children only).
 * - Keep `accept` short (`image/*`) — long MIME/extension lists silently fail on Android.
 */
export function ImageFileHitArea({
  children,
  onChange,
  disabled = false,
  className,
  accept = "image/*",
  "aria-label": ariaLabel = "Upload photo",
}: ImageFileHitAreaProps) {
  const inputId = useId();

  return (
    <label
      htmlFor={inputId}
      className={cn(
        "relative block cursor-pointer touch-manipulation select-none",
        disabled && "pointer-events-none opacity-60",
        className
      )}
    >
      <span className="pointer-events-none block h-full w-full">{children}</span>
      <input
        id={inputId}
        type="file"
        accept={accept}
        disabled={disabled}
        aria-label={ariaLabel}
        // Keep out of any parent <form> (Firefox “Leave this page?” after pick).
        form="_hel_nofileform"
        // Direct tap target over the whole label — required for iOS/Android.
        className="absolute inset-0 z-[60] m-0 block h-full w-full max-w-none cursor-pointer border-0 p-0"
        style={{
          fontSize: 16,
          WebkitTapHighlightColor: "transparent",
          // Fully transparent (0) is ignored by some Android WebViews.
          opacity: 0.011,
        }}
        onChange={onChange}
      />
    </label>
  );
}
