"use client";

import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/translations";

export function LanguageToggle({ className }: { className?: string }) {
  const { locale, setLocale, t } = useTranslation();

  const nextLocale: Locale = locale === "so" ? "en" : "so";
  const label = locale === "so" ? "EN" : "SO";

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => setLocale(nextLocale)}
      className={className}
      aria-label={t("common.toggleLanguage")}
      title={
        locale === "so"
          ? t("common.languageEnglish")
          : t("common.languageSomali")
      }
    >
      <Languages className="h-4 w-4" />
      <span className="font-semibold">{label}</span>
    </Button>
  );
}
