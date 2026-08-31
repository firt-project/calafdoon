"use client";

import { useMemo } from "react";
import { useCompatibilityBreakdown } from "@/data/matching/hooks";
import { useTranslation } from "@/lib/i18n/context";
import type { TranslationPath } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";

const COMPAT_LABEL_KEYS: Record<string, TranslationPath> = {
  religion: "premium.compatReligion",
  prayer: "premium.compatPrayer",
  age: "premium.compatAge",
  country: "premium.compatCountry",
  height: "premium.compatHeight",
  education: "premium.compatEducation",
  children: "premium.compatChildren",
  maritalStatus: "premium.compatMaritalStatus",
  qualities: "premium.compatQualities",
  hobbies: "premium.compatHobbies",
  timeline: "premium.compatTimeline",
  wantChildren: "premium.compatWantChildren",
  livingSituation: "premium.compatLivingSituation",
  languages: "premium.compatLanguages",
  appearance: "premium.compatAppearance",
  polygyny: "premium.compatPolygyny",
};

type Category = {
  key: string;
  score: number;
  maxScore: number;
};

function asCategories(value: unknown): Category[] {
  if (!value || typeof value !== "object") return [];
  const raw = (value as { categories?: unknown }).categories;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.key !== "string") return [];
    const score = Number(row.score);
    const maxScore = Number(row.maxScore);
    if (!Number.isFinite(score) || !Number.isFinite(maxScore)) return [];
    return [{ key: row.key, score, maxScore }];
  });
}

interface CompatibilityBreakdownProps {
  targetUserId: string;
  isPremium: boolean;
  overallScore?: number;
}

export function CompatibilityBreakdown({
  targetUserId,
  isPremium,
  overallScore,
}: CompatibilityBreakdownProps) {
  const { t } = useTranslation();
  const { data: breakdownRaw } = useCompatibilityBreakdown(
    targetUserId ? String(targetUserId) : undefined,
    isPremium
  );
  const categories = useMemo(() => asCategories(breakdownRaw), [breakdownRaw]);

  const narrative = useMemo(() => {
    if (categories.length === 0) return null;
    const ranked = categories
      .map((item) => ({
        ...item,
        pct: item.maxScore > 0 ? item.score / item.maxScore : 0,
      }))
      .sort((a, b) => b.pct - a.pct);

    return {
      strong: ranked.filter((c) => c.pct >= 0.75).slice(0, 3),
      different: ranked.filter((c) => c.pct < 0.45).slice(0, 2),
    };
  }, [categories]);

  if (!isPremium) {
    return (
      <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4">
        <p className="text-sm font-semibold">
          {t("premium.compatibilityLockedTitle")}
        </p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          {t("premium.compatibilityLockedDesc")}
        </p>
      </div>
    );
  }

  if (breakdownRaw === undefined) {
    return <div className="h-24 rounded-2xl bg-muted/50 animate-pulse" />;
  }

  if (categories.length === 0) return null;

  return (
    <div className="rounded-2xl bg-muted/50 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("premium.compatibilityBreakdown")}
          </p>
          {overallScore !== undefined && (
            <p className="mt-1 text-2xl font-semibold text-primary tabular-nums">
              {overallScore}%
            </p>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        {t("premium.compatibilityGuideNote")}
      </p>

      {narrative && narrative.strong.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-primary mb-1.5">
            {t("premium.compatStrong")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {narrative.strong.map((item) => {
              const labelKey = COMPAT_LABEL_KEYS[item.key];
              if (!labelKey) return null;
              return (
                <span
                  key={item.key}
                  className="rounded-full bg-primary/10 text-primary px-2.5 py-1 text-[11px] font-medium"
                >
                  {t(labelKey)}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {narrative && narrative.different.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1.5">
            {t("premium.compatDifferent")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {narrative.different.map((item) => {
              const labelKey = COMPAT_LABEL_KEYS[item.key];
              if (!labelKey) return null;
              return (
                <span
                  key={item.key}
                  className="rounded-full bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200 px-2.5 py-1 text-[11px] font-medium"
                >
                  {t(labelKey)}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-2.5 pt-1 border-t border-border/60">
        {categories.map((item) => {
          const labelKey = COMPAT_LABEL_KEYS[item.key];
          if (!labelKey) return null;
          const pct =
            item.maxScore > 0
              ? Math.round((item.score / item.maxScore) * 100)
              : 0;
          return (
            <div key={item.key}>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium">{t(labelKey)}</span>
                <span className="text-muted-foreground tabular-nums">
                  {Math.round(item.score)}/{item.maxScore}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    pct >= 75
                      ? "bg-primary"
                      : pct >= 45
                        ? "bg-primary/60"
                        : "bg-amber-500"
                  )}
                  style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
