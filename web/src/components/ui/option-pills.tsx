"use client";

import { cn } from "@/lib/utils";

interface OptionPillsProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}

export function OptionPills({ value, onChange, options, className }: OptionPillsProps) {
  return (
    <div className={cn("grid grid-cols-2 gap-3", className)}>
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "relative flex h-12 items-center justify-center rounded-xl border px-4 text-sm font-medium transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
              selected
                ? "border-primary bg-accent text-accent-foreground shadow-sm"
                : "border-border bg-input text-foreground hover:border-primary/40 hover:bg-muted/50"
            )}
          >
            {selected && (
              <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />
            )}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
