"use client";

import type { TranslationPath } from "@/lib/i18n/translations";
import { useTranslation } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

const HIGHLIGHT_LABEL_KEYS: Record<string, TranslationPath> = {
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

export function CompatibilityHighlights({
  keys,
  className,
  heading,
}: {
  keys?: string[] | null;
  className?: string;
  /** Optional mono label above the chips, e.g. "where you align". */
  heading?: string;
}) {
  const { t } = useTranslation();
  const list = Array.isArray(keys)
    ? keys.filter((k): k is string => typeof k === "string" && !!HIGHLIGHT_LABEL_KEYS[k])
    : [];
  if (list.length === 0) return null;

  return (
    <div className={className}>
      {heading ? (
        <p className="mb-1.5 font-mono text-[0.62rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {heading}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {list.map((key) => {
          const labelKey = HIGHLIGHT_LABEL_KEYS[key];
          if (!labelKey) return null;
          return (
            <span
              key={key}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium",
                "border-[color-mix(in_srgb,var(--leaf)_35%,transparent)] bg-[color-mix(in_srgb,var(--leaf)_12%,transparent)] text-leaf"
              )}
            >
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
                <path
                  d="M1.5 4.7 3.4 6.6 7.5 2.4"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {t(labelKey)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
