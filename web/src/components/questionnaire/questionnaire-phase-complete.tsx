"use client";

import { Check, ChevronRight, Heart, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuestionnaireI18n } from "@/lib/i18n/questionnaire-i18n";

type Phase = "about" | "partner";

interface QuestionnairePhaseCompleteProps {
  phase: Phase;
  onContinue: () => void;
}

export function QuestionnairePhaseComplete({
  phase,
  onContinue,
}: QuestionnairePhaseCompleteProps) {
  const isAbout = phase === "about";
  const { ui } = useQuestionnaireI18n();

  return (
    <div className="flex flex-col items-center py-8 text-center sm:py-12">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--leaf)_14%,transparent)] text-leaf">
        <Check className="h-8 w-8" strokeWidth={2.5} />
      </div>

      <p className="mb-3 font-mono text-[0.68rem] font-medium uppercase tracking-[0.14em] text-primary">
        {isAbout ? ui("part1Complete") : ui("part2Complete")}
      </p>

      <h2 className="mb-3 font-display text-[1.625rem] font-medium tracking-tight sm:text-3xl">
        {isAbout ? ui("infoSaved") : ui("prefsSaved")}
      </h2>

      <p className="mb-10 max-w-md text-lg leading-relaxed text-muted-foreground">
        {isAbout ? ui("part1Desc") : ui("part2Desc")}
      </p>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-10 w-full max-w-sm">
        <div className="flex items-center gap-2 rounded-2xl border border-primary/20 bg-primary/[0.04] px-4 py-3 text-sm font-medium w-full sm:w-auto justify-center">
          <User className="h-4 w-4 text-primary" />
          {ui("aboutYouChip")}
          <Check className="h-4 w-4 text-primary ml-auto sm:ml-0" />
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground rotate-90 sm:rotate-0" />
        <div
          className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium w-full sm:w-auto justify-center ${
            isAbout
              ? "border border-dashed border-border text-muted-foreground"
              : "border border-primary/20 bg-primary/[0.04]"
          }`}
        >
          <Heart className={`h-4 w-4 ${isAbout ? "text-muted-foreground" : "text-primary"}`} />
          {ui("partnerPrefsChip")}
          {!isAbout && <Check className="h-4 w-4 text-primary ml-auto sm:ml-0" />}
        </div>
      </div>

      <Button
        size="lg"
        className="h-14 min-h-14 w-full max-w-sm text-lg font-semibold"
        onClick={onContinue}
      >
        {isAbout ? ui("continueToPartner") : ui("continueToPhoto")}
        <ChevronRight className="ml-2 h-5 w-5" />
      </Button>
    </div>
  );
}
