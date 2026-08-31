"use client";

import { useState } from "react";
import { Shield, ChevronDown, ChevronUp } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

export function ChatSafetyBanner() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const tips = [
    t("safety.chatTip1"),
    t("safety.chatTip2"),
    t("safety.chatTip3"),
    t("safety.chatTip4"),
  ];

  return (
    <div className="mx-4 mt-3 rounded-2xl border border-primary/15 bg-primary/5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Shield className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-sm font-semibold">{t("safety.chatGuidelinesTitle")}</span>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      <div
        className={cn(
          "overflow-hidden transition-all",
          open ? "max-h-48 opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <ul className="space-y-2 px-4 pb-4 text-xs text-muted-foreground leading-relaxed">
          {tips.map((tip) => (
            <li key={tip} className="flex gap-2">
              <span className="text-primary">•</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
