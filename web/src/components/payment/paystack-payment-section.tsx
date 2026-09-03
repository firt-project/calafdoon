"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Lock, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MONTHLY_PRICE, REGISTRATION_PRICE, formatMoney } from "@/lib/constants";
import { getSafeUserError } from "@/lib/safe-error";
import { useTranslation } from "@/lib/i18n/context";
import { useProfile } from "@/data/profile/hooks";
import { usePaystackCheckout, usePaystackEnabled } from "@/data/payments/hooks";
import { cn } from "@/lib/utils";

/**
 * "Paystack M-Pesa" checkout — Paystack's hosted `mobile_money` channel, which
 * opens straight to an M-Pesa STK push. Renders an unavailable notice until
 * PAYSTACK_SECRET_KEY is configured on the API host.
 */
export function PaystackPaymentSection() {
  const { t } = useTranslation();
  const { profile: profileRaw } = useProfile();
  const profile = profileRaw as
    | { hasPaid?: boolean | null }
    | null
    | undefined;
  const startCheckout = usePaystackCheckout();
  const { enabled, loading: enabledLoading } = usePaystackEnabled();
  const [submitting, setSubmitting] = useState(false);

  const unavailable = !enabledLoading && !enabled;

  // Renewing members (already paid once) are charged $1/month, not $4.99.
  const isRenewal = Boolean(profile?.hasPaid);
  const priceLabel = formatMoney(isRenewal ? MONTHLY_PRICE : REGISTRATION_PRICE);
  const monthlyLabel = formatMoney(MONTHLY_PRICE);
  const firstLabel = formatMoney(REGISTRATION_PRICE);

  const onPay = async () => {
    setSubmitting(true);
    try {
      const result = await startCheckout({
        tier: "basic",
        channel: "mobile_money",
      });
      if (!result?.authorizationUrl) {
        throw new Error(t("payment.mpesaFailed"));
      }
      window.location.href = result.authorizationUrl;
    } catch (error) {
      toast.error(getSafeUserError(error, t("payment.mpesaFailed")));
      setSubmitting(false);
    }
  };

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[1.75rem] border border-border/80",
        "bg-gradient-to-b from-card via-card to-muted/30",
        "shadow-[0_24px_48px_-28px_rgba(166,27,43,0.35)]"
      )}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(120%_80%_at_50%_-20%,color-mix(in_srgb,var(--primary)_18%,transparent),transparent)]"
        aria-hidden
      />
      <div className="h-1 bg-gradient-to-r from-primary via-[#c43a4a] to-primary/70" />

      <div className="relative space-y-7 p-6 sm:p-8">
        <header className="space-y-3 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            <Smartphone className="h-3.5 w-3.5" />
            {t("payment.mpesaBadge")}
          </div>
          <h2 className="font-display text-3xl sm:text-4xl tracking-tight text-foreground">
            {t("payment.mpesaCheckoutTitle")}
          </h2>
          <p className="max-w-md text-sm sm:text-[15px] leading-relaxed text-muted-foreground sm:mx-0 mx-auto">
            {t("payment.mpesaCheckoutSubtitle", {
              price: firstLabel,
              monthly: monthlyLabel,
            })}
          </p>
        </header>

        <div className="flex items-end justify-between gap-4 rounded-2xl border border-border/70 bg-background/80 px-5 py-4 backdrop-blur-sm">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t("payment.basicPlan")}
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="font-display text-4xl sm:text-5xl font-semibold tabular-nums text-primary">
                ${priceLabel}
              </span>
              <span className="text-sm font-medium text-muted-foreground">
                {t("common.for30Days")}
              </span>
            </div>
            <p className="mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">
              {t("payment.paystackPeriodNote", {
                price: firstLabel,
                monthly: monthlyLabel,
              })}
            </p>
          </div>
          <div className="hidden sm:flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Lock className="h-5 w-5" />
          </div>
        </div>

        {unavailable ? (
          <div className="flex items-start gap-2.5 rounded-2xl border border-amber-400/40 bg-amber-50/90 px-4 py-3 text-sm leading-relaxed text-foreground/90 dark:border-amber-700/50 dark:bg-amber-950/40">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p>{t("payment.gatewayUnavailable")}</p>
          </div>
        ) : (
          <Button
            type="button"
            size="lg"
            onClick={onPay}
            disabled={submitting || profile === undefined || enabledLoading}
            className={cn(
              "h-14 w-full rounded-2xl text-[15px] font-semibold tracking-wide",
              "shadow-lg shadow-primary/20 transition-transform duration-200",
              !submitting && "hover:scale-[1.01] active:scale-[0.99]"
            )}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("payment.mpesaRedirecting")}
              </>
            ) : (
              t("payment.mpesaPay", { price: priceLabel })
            )}
          </Button>
        )}

        <div className="flex items-start gap-2.5 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>
            <span className="font-medium text-foreground/80">
              {t("payment.mpesaSecureNote")}
            </span>{" "}
            {t("payment.mpesaStepsNote")}
          </p>
        </div>
      </div>
    </section>
  );
}
