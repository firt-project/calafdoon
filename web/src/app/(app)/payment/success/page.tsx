"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Check,
  ClipboardList,
  Headphones,
  Loader2,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n/context";
import { WHATSAPP_URL } from "@/lib/constants";
import { clearPlanPreference } from "@/lib/plan-preference";
import { useVerifyCheckoutSession } from "@/data/payments/hooks";

export default function PaymentSuccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const verifyCheckout = useVerifyCheckoutSession();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [isPremium, setIsPremium] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (!sessionId) {
      setStatus("error");
      setError(t("payment.missingSession"));
      return;
    }

    let cancelled = false;

    async function verify() {
      try {
        const result = (await verifyCheckout({
          sessionId: sessionId!,
        })) as { isPremium?: boolean };
        if (!cancelled) {
          setIsPremium(Boolean(result?.isPremium));
          setStatus("success");
          clearPlanPreference();
        }
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setError(
            err instanceof Error ? err.message : t("payment.verifyFailed")
          );
        }
      }
    }

    void verify();
    return () => {
      cancelled = true;
    };
  }, [sessionId, verifyCheckout, t]);

  return (
    <DashboardLayout>
      <div className="max-w-lg mx-auto py-12 sm:py-16 px-4">
        {status === "loading" && (
          <Card className="rounded-3xl border-border shadow-lg">
            <CardContent className="py-16 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
              <h1 className="text-2xl font-bold mb-2">{t("payment.confirming")}</h1>
              <p className="text-muted-foreground">{t("payment.confirmingDesc")}</p>
            </CardContent>
          </Card>
        )}

        {status === "success" && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <Card className="rounded-3xl border-primary/20 shadow-xl shadow-primary/10 overflow-hidden">
              <div className="h-1.5 bg-gradient-to-r from-primary/80 via-primary to-primary/60" />
              <CardContent className="py-10 sm:py-12 text-center">
                <div className="relative mx-auto w-fit mb-6">
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary mx-auto">
                    {isPremium ? (
                      <Headphones className="h-10 w-10" />
                    ) : (
                      <Check className="h-10 w-10" strokeWidth={2.5} />
                    )}
                  </div>
                  <Sparkles className="absolute -top-1 -right-1 h-5 w-5 text-gold" />
                </div>

                <h1 className="text-2xl sm:text-3xl font-bold mb-2">{t("payment.success")}</h1>
                <p className="text-muted-foreground mb-8 leading-relaxed max-w-sm mx-auto">
                  {isPremium ? t("payment.premiumSuccessDesc") : t("payment.successDesc")}
                </p>

                <div className="rounded-2xl bg-muted/50 border border-border p-4 mb-8 text-left">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-3">
                    {t("payment.nextSteps")}
                  </p>
                  <ol className="space-y-2.5 text-sm text-muted-foreground">
                    {isPremium && (
                      <li className="flex items-center gap-2.5">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
                        <span className="font-medium text-foreground/90">{t("payment.nextStepPremium")}</span>
                      </li>
                    )}
                    <li className="flex items-center gap-2.5">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">
                        {isPremium ? "2" : "1"}
                      </span>
                      <span className="font-medium text-foreground/90">{t("payment.nextStep1")}</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">
                        {isPremium ? "3" : "2"}
                      </span>
                      <span className="font-medium text-foreground/90">{t("payment.nextStep2")}</span>
                    </li>
                  </ol>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  {isPremium && (
                    <Button asChild className="font-semibold">
                      <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                        <MessageCircle className="h-4 w-4 mr-2" />
                        {t("payment.premiumWhatsApp")}
                      </a>
                    </Button>
                  )}
                  <Button
                    variant={isPremium ? "outline" : "default"}
                    className="font-semibold"
                    onClick={() => router.push("/matches")}
                  >
                    <ClipboardList className="h-4 w-4 mr-2" />
                    {t("payment.viewMatches")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {status === "error" && (
          <Card className="rounded-3xl border-destructive/30">
            <CardContent className="py-12 text-center">
              <h1 className="text-2xl font-bold mb-2">{t("payment.verifyFailed")}</h1>
              <p className="text-muted-foreground mb-6">{error}</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={() => router.push("/payment")} className="font-semibold">
                  {t("payment.tryAgain")}
                </Button>
                <Button variant="outline" onClick={() => router.push("/matches")}>
                  {t("common.goToDashboard")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
