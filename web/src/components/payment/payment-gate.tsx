"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Check, CreditCard, Lock, ShieldCheck, Smartphone, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { REGISTRATION_PRICE, MONTHLY_PRICE } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { EvcPaymentSection } from "@/components/payment/evc-payment-section";
import { WaafiPaymentSection } from "@/components/payment/waafi-payment-section";
import { PaystackPaymentSection } from "@/components/payment/paystack-payment-section";
import {
  useCreateRegistrationCheckout,
  usePaystackEnabled,
} from "@/data/payments/hooks";

type RegistrationTier = "basic" | "premium";
type PayMethod = "card" | "waafi" | "mpesa" | "paystack" | "evc";

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
    <div className="flex items-center justify-center gap-2 sm:gap-3 mb-8">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5">
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                step.done
                  ? "bg-primary text-primary-foreground"
                  : "bg-primary/15 text-primary ring-2 ring-primary/40"
              )}
            >
              {step.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span
              className={cn(
                "text-xs font-semibold hidden sm:inline",
                step.done ? "text-muted-foreground" : "text-foreground"
              )}
            >
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={cn("h-px w-6 sm:w-10", step.done ? "bg-primary/40" : "bg-border")} />
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
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "secondary"}
      className={cn(
        "rounded-xl px-3.5 sm:px-4 h-9 text-[13px] font-semibold transition-all duration-200",
        active
          ? "shadow-md shadow-primary/20"
          : "bg-transparent text-foreground/80 hover:bg-background/80 hover:text-foreground"
      )}
      onClick={onClick}
    >
      {children}
    </Button>
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
  const { enabled: paystackEnabled } = usePaystackEnabled();
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

      <div className="text-center mb-8 space-y-3">
        <div className="relative mx-auto w-fit mb-2">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary shadow-md shadow-primary/10">
            <Lock className="h-7 w-7" />
          </div>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          {title ?? t("payment.completeRegistration")}
        </h1>
        <p className="text-muted-foreground leading-relaxed max-w-2xl mx-auto text-sm sm:text-base">
          {description ??
            t("payment.chooseBasicOnly", {
              basic: formatPrice(basicPrice),
              monthly: formatPrice(monthlyPrice),
            })}
        </p>
      </div>

      <div className="mb-7 flex justify-center">
        <div className="inline-flex flex-wrap justify-center gap-1 rounded-2xl border border-border/80 bg-muted/70 p-1.5 shadow-inner">
          <MethodButton
            active={payMethod === "card"}
            onClick={() => setPayMethod("card")}
          >
            <CreditCard className="h-4 w-4 mr-2" />
            {t("payment.payWithCard")}
          </MethodButton>
          <MethodButton
            active={payMethod === "waafi"}
            onClick={() => setPayMethod("waafi")}
          >
            <Smartphone className="h-4 w-4 mr-2" />
            {t("payment.payWithWaafi")}
          </MethodButton>
          {paystackEnabled ? (
            <>
              <MethodButton
                active={payMethod === "mpesa"}
                onClick={() => setPayMethod("mpesa")}
              >
                <Smartphone className="h-4 w-4 mr-2" />
                {t("payment.payWithMpesa")}
              </MethodButton>
              <MethodButton
                active={payMethod === "paystack"}
                onClick={() => setPayMethod("paystack")}
              >
                <CreditCard className="h-4 w-4 mr-2" />
                {t("payment.payWithPaystack")}
              </MethodButton>
            </>
          ) : null}
          <MethodButton
            active={payMethod === "evc"}
            onClick={() => setPayMethod("evc")}
          >
            {t("payment.payWithMobileMoney")}
          </MethodButton>
        </div>
      </div>

      {payMethod === "card" ? (
        <>
          <Card className="overflow-hidden rounded-3xl border-primary shadow-xl shadow-primary/10 ring-2 ring-primary/20">
            <div className="h-1.5 bg-gradient-to-r from-primary/80 via-primary to-primary/60" />
            <CardContent className="p-6 sm:p-7 space-y-5 flex flex-col h-full">
              <div className="space-y-2">
                <h2 className="text-xl font-bold">{t("payment.basicPlan")}</h2>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-4xl font-bold text-primary">
                    ${formatPrice(basicPrice)}
                  </span>
                  <span className="text-sm text-muted-foreground font-medium">
                    {t("common.oneTime")}
                  </span>
                  <span className="text-sm font-semibold text-primary/90">
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

              <ul className="space-y-2.5 text-sm text-muted-foreground flex-1">
                {BASIC_FEATURES.map((key) => (
                  <li key={key} className="flex items-center gap-2.5">
                    <Sparkles className="h-4 w-4 text-primary shrink-0" />
                    <span className="font-medium text-foreground/80">{t(key)}</span>
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

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
            <span className="font-medium">
              {t("payment.stripeNote", {
                price: formatPrice(basicPrice),
                monthly: formatPrice(monthlyPrice),
              })}
            </span>
            <span className="hidden sm:inline text-border">|</span>
            <span className="font-semibold tracking-wide">VISA</span>
            <span className="font-semibold tracking-wide">MC</span>
            <span className="font-semibold tracking-wide">AMEX</span>
          </div>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t("payment.stripeNoProofNote")}
          </p>
        </>
      ) : null}

      {payMethod === "waafi" ? <WaafiPaymentSection /> : null}

      {payMethod === "mpesa" && paystackEnabled ? (
        <PaystackPaymentSection variant="mpesa" />
      ) : null}

      {payMethod === "paystack" && paystackEnabled ? (
        <PaystackPaymentSection />
      ) : null}

      {payMethod === "evc" ? <EvcPaymentSection gender={gender} /> : null}
    </div>
  );
}
