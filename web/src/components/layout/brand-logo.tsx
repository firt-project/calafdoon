"use client";

import Link from "next/link";
import { SITE_BRAND_NAME } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  href?: string;
  size?: "sm" | "md";
  showName?: boolean;
  showTagline?: boolean;
  variant?: "default" | "light";
  className?: string;
}

/**
 * Hel Calafkaaga wordmark. The mark is a pomegranate (rummaan) — one skin, many
 * seeds held together. Pomegranate stroke + a couple of gold seeds.
 */
function PomegranateMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 26 26"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M13 2.6c1 1.7.7 3-.3 4"
        stroke="var(--gold)"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M13 6.4c4.3 0 7.6 3.6 7.6 8.3 0 5-3.4 8.7-7.6 8.7s-7.6-3.7-7.6-8.7c0-4.7 3.3-8.3 7.6-8.3Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <circle cx="10.2" cy="13" r="1.3" fill="currentColor" />
      <circle cx="15.8" cy="13" r="1.3" fill="currentColor" />
      <circle cx="13" cy="17" r="1.3" fill="currentColor" />
      <circle cx="10.6" cy="19.6" r="1.15" fill="var(--gold)" />
      <circle cx="15.4" cy="19.6" r="1.15" fill="var(--gold)" />
    </svg>
  );
}

export function BrandLogo({
  href = "/",
  size = "md",
  showName = true,
  showTagline = false,
  variant = "default",
  className,
}: BrandLogoProps) {
  const { t } = useTranslation();
  const iconSize = size === "sm" ? "h-8 w-8" : "h-9 w-9";
  const markSize = size === "sm" ? "h-5 w-5" : "h-6 w-6";
  const textSize =
    size === "sm" ? "text-[0.95rem]" : "text-lg sm:text-xl";
  const isLight = variant === "light";

  return (
    <Link
      href={href}
      aria-label={SITE_BRAND_NAME}
      className={cn("inline-flex items-center gap-2.5 group", className)}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-lg border transition-transform group-hover:scale-105",
          isLight
            ? "border-white/25 text-white"
            : "border-primary/25 text-primary",
          iconSize
        )}
        aria-hidden
      >
        <PomegranateMark className={markSize} />
      </span>
      {showName && (
        <span className="flex flex-col leading-none">
          <span
            className={cn(
              "whitespace-nowrap font-display font-semibold tracking-tight",
              textSize,
              isLight ? "text-white" : "text-foreground"
            )}
          >
            {SITE_BRAND_NAME}
          </span>
          {showTagline && (
            <span
              className={cn(
                "mt-1 font-mono text-[0.62rem] uppercase tracking-[0.14em]",
                isLight ? "text-white/70" : "text-muted-foreground"
              )}
            >
              {t("brand.tagline")}
            </span>
          )}
        </span>
      )}
    </Link>
  );
}
