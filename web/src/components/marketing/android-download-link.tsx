"use client";

import { Smartphone } from "lucide-react";
import { PLAY_STORE_URL } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

type AndroidDownloadLinkProps = {
  className?: string;
  variant?: "button" | "ghost" | "footer";
  onClick?: () => void;
};

export function AndroidDownloadLink({
  className,
  variant = "button",
  onClick,
}: AndroidDownloadLinkProps) {
  const { t } = useTranslation();

  return (
    <a
      href={PLAY_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-semibold transition-colors",
        variant === "button" &&
          "h-12 rounded-2xl border border-white/35 bg-white/10 px-6 text-sm text-white backdrop-blur-sm hover:bg-white/20",
        variant === "ghost" &&
          "h-11 w-full rounded-xl border border-border bg-muted/40 px-4 text-sm text-foreground hover:bg-muted",
        variant === "footer" &&
          "rounded-lg bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20",
        className
      )}
    >
      <Smartphone className="h-4 w-4 shrink-0" />
      <span>{t("common.downloadAndroidApp")}</span>
    </a>
  );
}
