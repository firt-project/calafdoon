"use client";

import { useTranslation } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

const DIMS: Record<Size, { box: number; r: number; stroke: number; value: string; label: string }> = {
  sm: { box: 44, r: 18, stroke: 4, value: "text-[0.72rem]", label: "hidden" },
  md: { box: 62, r: 26, stroke: 5, value: "text-[0.95rem]", label: "text-[0.5rem]" },
  lg: { box: 88, r: 38, stroke: 6, value: "text-[1.35rem]", label: "text-[0.58rem]" },
};

/**
 * The compatibility score as the primary visual — a pomegranate arc, not a
 * swipe. Falls back to nothing when there is no score to show.
 */
export function CompatibilityRing({
  score,
  size = "md",
  showLabel = true,
  className,
}: {
  score?: number | null;
  size?: Size;
  showLabel?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  if (typeof score !== "number" || !Number.isFinite(score)) return null;

  const pct = Math.max(0, Math.min(100, Math.round(score)));
  const { box, r, stroke, value, label } = DIMS[size];
  const c = 2 * Math.PI * r;
  const center = box / 2;

  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: box, height: box }}
      role="img"
      aria-label={t("matchesPage.matchPercent", { score: pct })}
    >
      <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} className="-rotate-90">
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
        />
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <b className={cn("font-display font-semibold tabular-nums", value)}>{pct}%</b>
        {showLabel && label !== "hidden" ? (
          <span
            className={cn(
              "font-mono uppercase tracking-[0.1em] text-muted-foreground",
              label
            )}
          >
            {t("landing.matchScoreLabel")}
          </span>
        ) : null}
      </span>
    </span>
  );
}
