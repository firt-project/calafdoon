"use client";

import { Smartphone } from "lucide-react";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { Button } from "@/components/ui/button";
import { ANDROID_APK_URL, PLAY_STORE_PACKAGE_ID, PLAY_STORE_URL } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/context";

export function DownloadPageContent() {
  const { t } = useTranslation();

  return (
    <MarketingPage
      title={t("downloadPage.title")}
      subtitle={t("downloadPage.subtitle")}
    >
      <div className="mx-auto max-w-lg rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-sm">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Smartphone className="h-7 w-7" />
        </div>
        <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
          {t("downloadPage.intro")}
        </p>

        <Button asChild size="lg" className="mt-6 h-12 w-full rounded-full text-base">
          <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer">
            {t("downloadPage.openPlayStore")}
          </a>
        </Button>

        <p className="mt-3 text-center text-xs text-muted-foreground">
          {t("downloadPage.packageLabel")}: {PLAY_STORE_PACKAGE_ID}
        </p>

        <p className="mt-6 text-sm font-semibold text-foreground">
          {t("downloadPage.stepsTitle")}
        </p>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
          <li>{t("downloadPage.step1")}</li>
          <li>{t("downloadPage.step2")}</li>
          <li>{t("downloadPage.step3")}</li>
          <li>{t("downloadPage.step4")}</li>
        </ol>

        <div className="mt-8 border-t border-border pt-5">
          <p className="text-xs text-muted-foreground">{t("downloadPage.apkFallback")}</p>
          <Button asChild variant="outline" className="mt-3 w-full rounded-full">
            <a href={ANDROID_APK_URL} rel="noopener noreferrer">
              {t("downloadPage.downloadApk")}
            </a>
          </Button>
        </div>
      </div>
    </MarketingPage>
  );
}
