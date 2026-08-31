"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type GenderValue = "male" | "female";

interface GenderSelectCardsProps {
  value: GenderValue | "";
  onChange: (value: GenderValue) => void;
  maleLabel: string;
  femaleLabel: string;
  disabled?: boolean;
}

function MaleIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 140"
      className={className}
      aria-hidden
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="60" cy="38" r="22" className="fill-primary/15 stroke-primary/40" strokeWidth="2" />
      <path
        d="M42 58c4 6 12 10 18 10s14-4 18-10"
        className="stroke-primary/50"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M28 92c8-18 24-28 32-28s24 10 32 28"
        className="fill-primary/10 stroke-primary/35"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M38 118h44c6 0 10 4 10 10v4H28v-4c0-6 4-10 10-10z"
        className="fill-primary/20 stroke-primary/40"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FemaleIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 140"
      className={className}
      aria-hidden
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M60 18c-16 0-28 14-28 30 0 8 3 15 8 20 4 4 10 8 20 8s16-4 20-8c5-5 8-12 8-20 0-16-12-30-28-30z"
        className="fill-primary/15 stroke-primary/40"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <ellipse cx="60" cy="52" rx="14" ry="16" className="fill-background/80" />
      <path
        d="M26 92c10-20 28-30 34-30s24 10 34 30"
        className="fill-primary/10 stroke-primary/35"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M36 118h48c6 0 10 4 10 10v4H26v-4c0-6 4-10 10-10z"
        className="fill-primary/20 stroke-primary/40"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GenderSelectCards({
  value,
  onChange,
  maleLabel,
  femaleLabel,
  disabled,
}: GenderSelectCardsProps) {
  const options: { id: GenderValue; label: string; Illustration: typeof MaleIllustration }[] = [
    { id: "male", label: maleLabel, Illustration: MaleIllustration },
    { id: "female", label: femaleLabel, Illustration: FemaleIllustration },
  ];

  return (
    <div className="grid grid-cols-2 gap-4">
      {options.map(({ id, label, Illustration }) => {
        const selected = value === id;
        return (
          <button
            key={id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(id)}
            className={cn(
              "relative flex flex-col items-center rounded-2xl border-2 px-3 pt-5 pb-4 transition-all duration-200 active:scale-[0.98]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              selected
                ? "border-primary bg-primary/[0.07] shadow-sm"
                : "border-border bg-card hover:border-primary/30 hover:bg-muted/40",
              disabled && "opacity-60 pointer-events-none"
            )}
          >
            {selected && (
              <span className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="h-4 w-4" strokeWidth={2.5} />
              </span>
            )}
            <Illustration className="h-28 w-full max-w-[7.5rem] mb-3" />
            <span className="text-lg font-semibold text-foreground">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
