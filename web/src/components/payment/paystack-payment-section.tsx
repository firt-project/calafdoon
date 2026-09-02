"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CreditCard, Loader2, Lock, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MONTHLY_PRICE, REGISTRATION_PRICE, formatMoney } from "@/lib/constants";
import { getSafeUserError } from "@/lib/safe-error";
import { useTranslation } from "@/lib/i18n/context";
import type { TranslationPath } from "@/lib/i18n/translations";
import { useProfile } from "@/data/profile/hooks";
import { usePaystackCheckout } from "@/data/payments/hooks";
import { cn } from "@/lib/utils";

type PaystackVariant = "paystack" | "mpesa";

type VariantConfig = {
  channel?: "mobile_money" | "card" | "bank";
  icon: typeof CreditCard;
  badgeKey: TranslationPath;
  titleKey: TranslationPath;
  subtitleKey: TranslationPath;
  payKey: TranslationPath;
  redirectingKey: TranslationPath;
  failedKey: TranslationPath;
  secureNoteKey: TranslationPath;
  cardsNoteKey: TranslationPath;
};

const VARIANTS: Record<PaystackVariant, VariantConfig> = {
  paystack: {
    channel: undefined,
    icon: CreditCard,
    badgeKey: "payment.paystackBadge",
    titleKey: "payment.paystackTitle",
    subtitleKey: "payment.paystackSubtitle",
    payKey: "payment.paystackPay",
    redirectingKey: "payment.paystackRedirecting",
    failedKey: "payment.paystackFailed",
    secureNoteKey: "payment.paystackSecureNote",
    cardsNoteKey: "payment.paystackCardsNote",
  },
  mpesa: {
    channel: "mobile_money",
    icon: Smartphone,
    badgeKey: "payment.mpesaBadge",
    titleKey: "payment.mpesaCheckoutTitle",
    subtitleKey: "payment.mpesaCheckoutSubtitle",
    payKey: "payment.mpesaPay",
    redirectingKey: "payment.mpesaRedirecting",
    failedKey: "payment.mpesaFailed",
    secureNoteKey: "payment.mpesaSecureNote",
    cardsNoteKey: "payment.mpesaStepsNote",
  },
};

export function PaystackPaymentSection({
  variant = "paystack",
}: {
  variant?: PaystackVariant;
} = {}) {
  const { t } = useTranslation();
  const cfg = VARIANTS[variant];
  const Icon = cfg.icon;
  const { profile: profileRaw } = useProfile();
  const profile = profileRaw as
    | { hasPaid?: boolean | null }
    | null
    | undefined;
  const startCheckout = usePaystackCheckout();
  const [submitting, setSubmitting] = useState(false);

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
        channel: cfg.channel,
      });
      if (!result?.authorizationUrl) {
        throw new Error(t(cfg.failedKey));
      }
      window.location.href = result.authorizationUrl;
    } catch (error) {
      toast.error(getSafeUserError(error, t(cfg.failedKey)));
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
            <Icon className="h-3.5 w-3.5" />
            {t(cfg.badgeKey)}
          </div>
          <h2 className="font-display text-3xl sm:text-4xl tracking-tight text-foreground">
            {t(cfg.titleKey)}
          </h2>
          <p className="max-w-md text-sm sm:text-[15px] leading-relaxed text-muted-foreground sm:mx-0 mx-auto">
            {t(cfg.subtitleKey, {
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

        <Button
          type="button"
          size="lg"
          onClick={onPay}
          disabled={submitting || profile === undefined}
          className={cn(
            "h-14 w-full rounded-2xl text-[15px] font-semibold tracking-wide",
            "shadow-lg shadow-primary/20 transition-transform duration-200",
            !submitting && "hover:scale-[1.01] active:scale-[0.99]"
          )}
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t(cfg.redirectingKey)}
            </>
          ) : (
            t(cfg.payKey, { price: priceLabel })
          )}
        </Button>

        <div className="flex items-start gap-2.5 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>
            <span className="font-medium text-foreground/80">
              {t(cfg.secureNoteKey)}
            </span>{" "}
            {t(cfg.cardsNoteKey)}
          </p>
        </div>
      </div>
    </section>
  );
}
