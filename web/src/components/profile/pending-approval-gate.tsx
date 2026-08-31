"use client";

import Link from "next/link";
import { Check, Clock, Lock, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WHATSAPP_URL } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

interface PendingApprovalGateProps {
  isPremium?: boolean;
  className?: string;
}

function StepRow({
  done,
  active,
  locked,
  label,
}: {
  done?: boolean;
  active?: boolean;
  locked?: boolean;
  label: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <div
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2",
          done && "border-primary bg-primary text-primary-foreground",
          active && "border-amber-500 bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400",
          locked && "border-muted-foreground/30 text-muted-foreground"
        )}
      >
        {done ? (
          <Check className="h-4 w-4" strokeWidth={2.5} />
        ) : active ? (
          <Clock className="h-3.5 w-3.5" />
        ) : (
          <Lock className="h-3.5 w-3.5" />
        )}
      </div>
      <span
        className={cn(
          "text-sm leading-snug pt-0.5",
          done && "text-foreground font-medium",
          active && "text-foreground font-semibold",
          locked && "text-muted-foreground"
        )}
      >
        {label}
      </span>
    </li>
  );
}

export function PendingApprovalGate({ isPremium = false, className }: PendingApprovalGateProps) {
  const { t } = useTranslation();

  return (
    <div className={cn("max-w-lg mx-auto py-4 px-2", className)}>
      <Card className="overflow-hidden border-amber-200/60 shadow-xl shadow-amber-500/5 dark:border-amber-900/40">
        <div className="h-1.5 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600" />
        <CardContent className="p-6 sm:p-8 space-y-6 text-center sm:text-left">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
            <div
              className={cn(
                "flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl",
                isPremium
                  ? "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-400"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
              )}
            >
              {isPremium ? (
                <Sparkles className="h-8 w-8" />
              ) : (
                <ShieldCheck className="h-8 w-8" />
              )}
            </div>
            <div className="space-y-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                {t("approvalGate.title")}
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {isPremium
                  ? t("approvalGate.subtitlePremium")
                  : t("approvalGate.subtitle")}
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-muted/50 p-4 sm:p-5 text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              {t("approvalGate.progressLabel")}
            </p>
            <ol className="space-y-3">
              <StepRow done label={t("approvalGate.stepPaid")} />
              <StepRow done label={t("approvalGate.stepProfile")} />
              <StepRow active label={t("approvalGate.stepReview")} />
              <StepRow locked label={t("approvalGate.stepMatches")} />
            </ol>
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed">
            {t("approvalGate.typicalWait")}
          </p>

          {isPremium && (
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-medium text-violet-800 hover:bg-violet-100 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-300"
            >
              <MessageCircle className="h-4 w-4" />
              {t("approvalGate.premiumWhatsApp")}
            </a>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <Button asChild className="flex-1 rounded-xl h-11">
              <Link href="/dashboard">{t("approvalGate.goToDashboard")}</Link>
            </Button>
            <Button asChild variant="outline" className="flex-1 rounded-xl h-11">
              <Link href="/profile">{t("approvalGate.viewProfile")}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Compact banner for inline use (e.g. dashboard reminders). */
export function PendingApprovalBanner({ isPremium = false }: { isPremium?: boolean }) {
  const { t } = useTranslation();

  return (
    <div className="rounded-2xl border border-amber-200/60 bg-amber-50/80 dark:border-amber-900/40 dark:bg-amber-950/20 p-4 flex items-start gap-3">
      <ShieldCheck className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400 mt-0.5" />
      <div>
        <p className="font-semibold text-sm">{t("approvalGate.title")}</p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          {isPremium ? t("approvalGate.subtitlePremium") : t("approvalGate.subtitle")}
        </p>
      </div>
    </div>
  );
}
