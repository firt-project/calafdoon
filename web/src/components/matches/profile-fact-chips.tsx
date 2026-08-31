"use client";

import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  GraduationCap,
  Heart,
  Moon,
  Ruler,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function formatHeightLabel(cm: number): string {
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}'${inches}" (${cm} cm)`;
}

export type ProfileFact = {
  key: string;
  label: string;
  icon: LucideIcon;
};

export function buildProfileFacts(input: {
  prayerFrequency?: string | null;
  religiousLevel?: string | null;
  maritalStatus?: string | null;
  occupation?: string | null;
  education?: string | null;
  height?: number | null;
}): ProfileFact[] {
  const facts: ProfileFact[] = [];
  const faith = input.prayerFrequency || input.religiousLevel;
  if (faith) facts.push({ key: "faith", label: faith, icon: Moon });
  if (input.maritalStatus) {
    facts.push({ key: "marital", label: input.maritalStatus, icon: Heart });
  }
  if (input.occupation) {
    facts.push({ key: "job", label: input.occupation, icon: Briefcase });
  }
  if (input.education) {
    facts.push({ key: "edu", label: input.education, icon: GraduationCap });
  }
  if (typeof input.height === "number" && input.height > 0) {
    facts.push({
      key: "height",
      label: formatHeightLabel(input.height),
      icon: Ruler,
    });
  }
  return facts;
}

export function ProfileFactChips({
  facts,
  className,
  chipClassName,
  max,
}: {
  facts: ProfileFact[];
  className?: string;
  chipClassName?: string;
  max?: number;
}) {
  const list = typeof max === "number" ? facts.slice(0, max) : facts;
  if (list.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {list.map((fact) => (
        <span
          key={fact.key}
          className={cn(
            "inline-flex max-w-full items-center gap-1 rounded-full border border-primary/25 bg-accent/70 px-2 py-1 text-[11px] font-medium text-foreground",
            chipClassName
          )}
        >
          <fact.icon className="h-3 w-3 shrink-0 text-primary" aria-hidden />
          <span className="truncate">{fact.label}</span>
        </span>
      ))}
    </div>
  );
}

export function ValueChips({
  values,
  className,
}: {
  values: string[];
  className?: string;
}) {
  if (values.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {values.map((value) => (
        <span
          key={value}
          className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1.5 text-xs font-medium text-foreground"
        >
          <Sparkles className="h-3 w-3 shrink-0 text-primary" aria-hidden />
          {value}
        </span>
      ))}
    </div>
  );
}
