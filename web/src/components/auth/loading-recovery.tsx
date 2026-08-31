"use client";

import { useRouter } from "next/navigation";
import { useUnifiedAuth } from "@/data/auth/hooks";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/lib/i18n/context";

export function LoadingRecovery({ stuck }: { stuck: boolean }) {
  const { t } = useTranslation();
  const { signOut } = useUnifiedAuth();
  const router = useRouter();

  if (!stuck) {
    return (
      <div className="space-y-4" role="status">
        <Skeleton className="h-10 w-64" aria-hidden />
        <Skeleton className="h-28 w-full rounded-2xl" aria-hidden />
        <Skeleton className="h-72 w-full rounded-2xl" aria-hidden />
        <p className="text-sm text-muted-foreground">{t("common.loadingData")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <p className="text-lg font-semibold">{t("setup.connectionTimeoutTitle")}</p>
      <p className="max-w-md text-sm text-muted-foreground">
        {t("common.loadingStuck")}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="outline" onClick={() => window.location.reload()}>
          {t("common.retry")}
        </Button>
        <Button
          onClick={() => {
            void signOut().finally(() => {
              router.replace("/login");
            });
          }}
        >
          {t("common.signInAgain")}
        </Button>
      </div>
    </div>
  );
}
