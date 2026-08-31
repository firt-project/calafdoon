"use client";

import { useTranslation } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

interface RegisterStepIndicatorProps {
  step: 1 | 2;
}

export function RegisterStepIndicator({ step }: RegisterStepIndicatorProps) {
  const { t } = useTranslation();

  const steps = [
    { n: 1 as const, label: t("auth.stepAccount") },
    { n: 2 as const, label: t("auth.stepProfile") },
  ];

  return (
    <div className="mb-2 space-y-3">
      <div className="flex items-center gap-3">
        {steps.map((s, i) => {
          const active = step === s.n;
          const done = step > s.n;
          return (
            <div key={s.n} className="flex flex-1 items-center gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold transition-colors",
                      active || done
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {s.n}
                  </span>
                  <span
                    className={cn(
                      "truncate text-sm font-medium",
                      active ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {s.label}
                  </span>
                </div>
                <div
                  className={cn(
                    "h-1 w-full rounded-sm transition-colors",
                    active || done ? "bg-primary" : "bg-muted"
                  )}
                />
              </div>
              {i < steps.length - 1 ? (
                <div className="mb-3 h-px w-3 shrink-0 bg-border" aria-hidden />
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="sr-only">{t("auth.stepOf", { step: String(step), total: "2" })}</p>
    </div>
  );
}
