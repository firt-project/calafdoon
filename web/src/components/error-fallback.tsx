"use client";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/context";

export function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
      <h2 className="text-xl font-bold mb-2">{t("errorPage.title")}</h2>
      <p className="text-muted-foreground mb-6">{t("errorPage.subtitle")}</p>
      <Button onClick={onRetry}>{t("errorPage.tryAgain")}</Button>
    </div>
  );
}
