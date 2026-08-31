"use client";

import { useTranslation } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

export function PlanChoiceNote({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <p className={cn("text-sm text-muted-foreground text-center leading-relaxed", className)}>
      {t("pricing.planChoiceLater")}
    </p>
  );
}
