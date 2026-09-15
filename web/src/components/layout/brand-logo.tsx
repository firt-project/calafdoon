"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
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

export function BrandLogo({
  href = "/",
  size = "md",
  showName = true,
  showTagline = false,
  variant = "default",
  className,
}: BrandLogoProps) {
  const { t } = useTranslation();
  const iconSize = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const heartSize = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const textSize = size === "sm" ? "text-base sm:text-lg" : "text-lg sm:text-xl";
  const isLight = variant === "light";

  return (
    <Link
      href={href}
      aria-label={SITE_BRAND_NAME}
      className={cn("inline-flex items-center gap-2.5 group", className)}
    >
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md transition-transform group-hover:scale-105",
          iconSize
        )}
        aria-hidden
      >
        <Heart className={heartSize} fill="currentColor" />
      </div>
      {showName && (
        <div className="flex min-w-0 flex-col leading-tight">
          <span
            className={cn(
              "font-display font-semibold tracking-tight truncate",
              textSize,
              isLight ? "text-white" : "text-foreground"
            )}
          >
            {SITE_BRAND_NAME}
          </span>
          {showTagline && (
            <span
              className={cn(
                "text-xs font-medium tracking-wide sm:text-sm",
                isLight ? "text-primary-foreground/80" : "text-primary"
              )}
            >
              {t("brand.tagline")}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
