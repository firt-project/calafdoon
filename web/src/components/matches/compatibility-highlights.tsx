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
}: {
  keys?: string[] | null;
  className?: string;
}) {
  const { t } = useTranslation();
  const list = Array.isArray(keys)
    ? keys.filter((k): k is string => typeof k === "string" && !!HIGHLIGHT_LABEL_KEYS[k])
    : [];
  if (list.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {list.map((key) => {
        const labelKey = HIGHLIGHT_LABEL_KEYS[key];
        if (!labelKey) return null;
        return (
          <span
            key={key}
            className="rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[11px] font-medium"
          >
            {t(labelKey)}
          </span>
        );
      })}
    </div>
  );
}
