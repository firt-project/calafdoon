"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Check, CreditCard, Lock, ShieldCheck, Smartphone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { REGISTRATION_PRICE, MONTHLY_PRICE } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { EvcPaymentSection } from "@/components/payment/evc-payment-section";
import { WaafiPaymentSection } from "@/components/payment/waafi-payment-section";
import { MpesaPaymentSection } from "@/components/payment/mpesa-payment-section";
import { useCreateRegistrationCheckout } from "@/data/payments/hooks";

type RegistrationTier = "basic" | "premium";
type PayMethod = "card" | "waafi" | "mpesa" | "evc";

function formatPrice(price: number): string {
  return Number.isInteger(price) ? String(price) : price.toFixed(2);
}

export function PaymentCheckoutButton({
  tier,
  className,
  size = "lg",
  variant = "default",
  labelPrice,
}: {
  tier: RegistrationTier;
  className?: string;
  size?: "default" | "sm" | "lg";
  variant?: "default" | "outline";
  labelPrice?: number;
}) {
  const createCheckout = useCreateRegistrationCheckout();
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();
  const price = labelPrice ?? REGISTRATION_PRICE;

  const handlePay = async () => {
    setLoading(true);
    try {
      const result = await createCheckout({ tier });
      const url = (result as { url?: string })?.url;
      if (!url) throw new Error("Missing checkout URL");
      window.location.href = url;
    } catch (error) {
      const { getSafeUserError } = await import("@/lib/safe-error");
      toast.error(getSafeUserError(error, "Payment failed. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handlePay}
      disabled={loading}
      size={size}
      variant={variant}
      className={cn("font-semibold", className)}
    >
      <CreditCard className="h-4 w-4 mr-2" />
      {loading
        ? t("payment.redirecting")
        : t("payment.pay", { price: formatPrice(price) })}
    </Button>
  );
}

interface PaymentGateProps {
  title?: string;
  description?: string;
  showProgress?: boolean;
  /** Admin read-only preview — no checkout actions. */
  previewMode?: boolean;
  /** @deprecated Premium is hidden — kept for older call sites. */
  freeBasic?: boolean;
  gender?: "male" | "female";
}

function PaymentProgress() {
  const { t } = useTranslation();
  const steps = [
    { label: t("payment.stepAccount"), done: true },
    { label: t("payment.stepProfile"), done: true },
    { label: t("payment.stepPayment"), done: false },
  ];

  return (
    <div className="mb-8 flex items-center justify-center gap-2 sm:gap-3">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5">
            <div
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full font-mono text-[0.7rem] font-medium",
                step.done
                  ? "bg-leaf text-leaf-foreground"
                  : "border border-primary text-primary"
              )}
            >
              {step.done ? <Check className="h-3 w-3" /> : i + 1}
            </div>
            <span
              className={cn(
                "hidden font-mono text-[0.68rem] uppercase tracking-[0.08em] sm:inline",
                step.done ? "text-muted-foreground" : "text-foreground"
              )}
            >
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={cn("h-px w-6 sm:w-10", step.done ? "bg-leaf/50" : "bg-border")} />
          )}
        </div>
      ))}
    </div>
  );
}

const BASIC_FEATURES = [
  "payment.featureProfile",
  "payment.featureBrowse",
  "payment.featureMatch",
  "payment.featureChat",
  "payment.featureTools",
] as const;

function MethodButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-md px-3 font-mono text-[0.72rem] uppercase tracking-[0.04em] transition-colors sm:px-3.5",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

export function PaymentGate({
  title,
  description,
  showProgress = true,
  previewMode = false,
  gender,
}: PaymentGateProps) {
  const { t } = useTranslation();
  const [payMethod, setPayMethod] = useState<PayMethod>("waafi");
  const basicPrice = REGISTRATION_PRICE;
  const monthlyPrice = MONTHLY_PRICE;
  const isWoman = gender === "female";

  return (
    <div className="max-w-lg mx-auto py-6 sm:py-8 px-2">
      {previewMode && (
        <p className="mb-4 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Preview only
        </p>
      )}
      {showProgress && <PaymentProgress />}

      <div className="mb-8 space-y-3 text-center">
        <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-xl border border-primary/25 text-primary">
          <Lock className="h-6 w-6" />
        </div>
        <h1 className="font-display text-2xl font-medium tracking-tight sm:text-3xl">
          {title ?? t("payment.completeRegistration")}
        </h1>
        <p className="mx-auto max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {description ??
            t("payment.chooseBasicOnly", {
              basic: formatPrice(basicPrice),
              monthly: formatPrice(monthlyPrice),
            })}
        </p>
      </div>

      <div className="mb-7 flex justify-center">
        <div className="inline-flex flex-wrap justify-center gap-0.5 rounded-lg border border-border bg-muted/60 p-1">
          <MethodButton
            active={payMethod === "mpesa"}
            onClick={() => setPayMethod("mpesa")}
          >
            <Smartphone className="mr-1.5 h-3.5 w-3.5" />
            {t("payment.payWithMpesa")}
          </MethodButton>
          <MethodButton
            active={payMethod === "waafi"}
            onClick={() => setPayMethod("waafi")}
          >
            <Smartphone className="mr-1.5 h-3.5 w-3.5" />
            {t("payment.payWithWaafi")}
          </MethodButton>
          <MethodButton
            active={payMethod === "evc"}
            onClick={() => setPayMethod("evc")}
          >
            {t("payment.payWithMobileMoney")}
          </MethodButton>
          <MethodButton
            active={payMethod === "card"}
            onClick={() => setPayMethod("card")}
          >
            <CreditCard className="mr-1.5 h-3.5 w-3.5" />
            {t("payment.payWithCard")}
          </MethodButton>
        </div>
      </div>

      {payMethod === "card" ? (
        <>
          <Card className="overflow-hidden rounded-2xl border-border">
            <CardContent className="flex h-full flex-col space-y-5 p-6 sm:p-7">
              <div className="space-y-2">
                <h2 className="font-display text-xl font-semibold">{t("payment.basicPlan")}</h2>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-display text-4xl font-semibold tabular-nums text-primary">
                    ${formatPrice(basicPrice)}
                  </span>
                  <span className="font-mono text-sm text-muted-foreground">
                    {t("common.oneTime")}
                  </span>
                  <span className="font-mono text-sm text-primary">
                    {t("common.thenMonthly", {
                      monthly: formatPrice(monthlyPrice),
                    })}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t("payment.basicPlanDesc", {
                    basic: formatPrice(basicPrice),
                    monthly: formatPrice(monthlyPrice),
                  })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isWoman
                    ? t("payment.womenBasicPriceNote", {
                        price: formatPrice(basicPrice),
                        monthly: formatPrice(monthlyPrice),
                      })
                    : t("payment.menPriceNote", {
                        price: formatPrice(basicPrice),
                        monthly: formatPrice(monthlyPrice),
                      })}
                </p>
              </div>

              <ul className="flex-1 space-y-2.5 text-sm">
                {BASIC_FEATURES.map((key) => (
                  <li key={key} className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 shrink-0 text-leaf" />
                    <span className="text-foreground/80">{t(key)}</span>
                  </li>
                ))}
              </ul>

              <PaymentCheckoutButton
                tier="basic"
                className="w-full"
                labelPrice={basicPrice}
              />
            </CardContent>
          </Card>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0 text-gold" />
            <span>
              {t("payment.stripeNote", {
                price: formatPrice(basicPrice),
                monthly: formatPrice(monthlyPrice),
              })}
            </span>
            <span className="hidden text-border sm:inline">|</span>
            <span className="font-mono tracking-wide">VISA</span>
            <span className="font-mono tracking-wide">MC</span>
            <span className="font-mono tracking-wide">AMEX</span>
          </div>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t("payment.stripeNoProofNote")}
          </p>
        </>
      ) : null}

      {payMethod === "waafi" ? <WaafiPaymentSection /> : null}

      {payMethod === "mpesa" ? <MpesaPaymentSection /> : null}

      {payMethod === "evc" ? <EvcPaymentSection gender={gender} /> : null}
    </div>
  );
}
