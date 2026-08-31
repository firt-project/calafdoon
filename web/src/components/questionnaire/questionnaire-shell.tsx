"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUnifiedAuth } from "@/data/auth/hooks";
import { ChevronLeft } from "lucide-react";
import { LoadingRecovery } from "@/components/auth/loading-recovery";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLoadingTimeout } from "@/hooks/use-loading-timeout";
import { useTranslation } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

interface QuestionnaireShellProps {
  children: ReactNode;
  progress: number;
  phaseLabel: string;
  /** e.g. "Step 3 of 10" */
  stepLabel?: string;
  /** e.g. "About 4 min remaining" */
  timeLabel?: string;
  progressHint?: string;
  onBack?: () => void;
  className?: string;
}

export function QuestionnaireShell({
  children,
  progress,
  phaseLabel,
  stepLabel,
  timeLabel,
  progressHint,
  onBack,
  className,
}: QuestionnaireShellProps) {
  const { isAuthenticated, isLoading } = useUnifiedAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const stuck = useLoadingTimeout(isLoading, 8_000);
  const clamped = Math.min(100, Math.max(0, progress));

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <div className="px-5 py-6 max-w-xl mx-auto w-full flex-1 flex flex-col justify-center">
          {stuck ? (
            <LoadingRecovery stuck />
          ) : (
            <div className="space-y-6">
              <Skeleton className="h-1.5 w-full rounded-full" />
              <Skeleton className="h-6 w-32 mx-auto" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-64 w-full rounded-2xl" />
              <p className="text-center text-sm text-muted-foreground" role="status">
                {t("common.loadingData")}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <div className="h-1.5 w-full bg-muted shrink-0" role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
        <div
          className="h-full bg-primary transition-all duration-500 ease-out rounded-r-full"
          style={{ width: `${clamped}%` }}
        />
      </div>

      <header className="shrink-0 border-b border-border/60 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-2 px-4">
          {onBack ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 rounded-full"
              onClick={onBack}
              aria-label={t("common.back")}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          ) : (
            <div className="w-10 shrink-0" />
          )}
          <div className="flex-1 text-center min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground truncate">
              {phaseLabel}
            </p>
            {stepLabel ? (
              <p className="text-[11px] text-foreground/70 mt-0.5 truncate">{stepLabel}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center justify-end">
            <LanguageToggle className="h-9 gap-1 rounded-full px-2.5" />
          </div>
        </div>
        {(progressHint || timeLabel) && (
          <div className="border-t border-border/40 py-2 px-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {progressHint ? <span>{progressHint}</span> : null}
            {progressHint && timeLabel ? (
              <span className="text-border" aria-hidden>
                ·
              </span>
            ) : null}
            {timeLabel ? <span>{timeLabel}</span> : null}
          </div>
        )}
      </header>

      <main
        className={cn(
          "flex-1 w-full max-w-xl mx-auto px-5 py-6 sm:py-8",
          className
        )}
      >
        {children}
      </main>
    </div>
  );
}
