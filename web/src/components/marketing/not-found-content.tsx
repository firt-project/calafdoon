"use client";

import Link from "next/link";
import { Home, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/context";

export function NotFoundContent() {
  const { t } = useTranslation();

  return (
    <div className="gradient-hero flex min-h-[calc(100dvh-var(--app-header)-12rem)] items-center justify-center px-4 py-16">
      <div className="mx-auto max-w-lg text-center">
        <p className="text-7xl font-bold tracking-tight text-primary/30 sm:text-8xl">404</p>
        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {t("notFound.title")}
        </h1>
        <p className="mt-4 text-muted-foreground leading-relaxed">{t("notFound.subtitle")}</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/">
              <Home className="mr-2 h-4 w-4" />
              {t("notFound.backHome")}
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/contact">
              <MessageCircle className="mr-2 h-4 w-4" />
              {t("notFound.contactSupport")}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
