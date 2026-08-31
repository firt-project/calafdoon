"use client";

import { useEffect } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ConfirmDialogTone = "danger" | "warning";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: ConfirmDialogTone;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const Icon = tone === "danger" ? Trash2 : AlertTriangle;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="presentation"
    >
      <button
        type="button"
        aria-label={cancelLabel}
        className="absolute inset-0 bg-[#1a1214]/55 backdrop-blur-sm"
        disabled={busy}
        onClick={() => {
          if (!busy) onCancel();
        }}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
        className="relative z-10 w-full max-w-md overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl sm:rounded-3xl"
      >
        <div
          className={cn(
            "flex items-start gap-3 border-b px-5 py-4",
            tone === "danger"
              ? "border-destructive/15 bg-destructive/5"
              : "border-amber-500/20 bg-amber-500/5"
          )}
        >
          <span
            className={cn(
              "mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
              tone === "danger"
                ? "bg-destructive/15 text-destructive"
                : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
            )}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2
              id="confirm-dialog-title"
              className="text-lg font-semibold tracking-tight text-foreground"
            >
              {title}
            </h2>
            <p
              id="confirm-dialog-desc"
              className="mt-1.5 text-sm leading-relaxed text-muted-foreground"
            >
              {description}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full"
            disabled={busy}
            onClick={onCancel}
            aria-label={cancelLabel}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-col-reverse gap-2 px-5 py-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={tone === "danger" ? "destructive" : "default"}
            className={cn(
              "rounded-xl",
              tone === "warning" && "bg-amber-700 text-white hover:bg-amber-800"
            )}
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
