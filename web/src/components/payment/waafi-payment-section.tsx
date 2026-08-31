"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Lock, Phone, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { REGISTRATION_PRICE, formatMoney } from "@/lib/constants";
import { getSafeUserError } from "@/lib/safe-error";
import { useTranslation } from "@/lib/i18n/context";
import { useProfile } from "@/data/profile/hooks";
import { useWaafiPurchase } from "@/data/payments/hooks";
import { cn } from "@/lib/utils";

const WAAFI_COUNTRY_CODE = "252";

const WAAFI_WALLETS = [
  { key: "payment.waafiWalletEvc", short: "EVC Plus" },
  { key: "payment.waafiWalletWaafi", short: "WAAFI" },
  { key: "payment.waafiWalletZaad", short: "ZAAD" },
  { key: "payment.waafiWalletSahal", short: "SAHAL" },
  { key: "payment.waafiWalletMpesa", short: "M-Pesa" },
] as const;

/** Keep only the national mobile part; strip pasted 252 / leading 0. */
function toLocalMobileDigits(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith(WAAFI_COUNTRY_CODE)) {
    digits = digits.slice(WAAFI_COUNTRY_CODE.length);
  }
  if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  return digits.slice(0, 12);
}

export function WaafiPaymentSection() {
  const { t } = useTranslation();
  const router = useRouter();
  const { profile: profileRaw, refresh: refreshProfile } = useProfile();
  const profile = profileRaw as { phone?: string | null } | null | undefined;
  const profilePhone = (profile?.phone ?? "").trim();
  const purchase = useWaafiPurchase();
  const [localMobile, setLocalMobile] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [focused, setFocused] = useState(false);
  const priceLabel = formatMoney(REGISTRATION_PRICE);
  const fullAccountNo = `${WAAFI_COUNTRY_CODE}${localMobile}`;
  const canPay =
    !submitting &&
    profile !== undefined &&
    Boolean(profilePhone) &&
    localMobile.length >= 8;

  const onPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (localMobile.length < 8) {
      toast.error(t("payment.waafiAccountInvalid"));
      return;
    }
    if (!profilePhone) {
      toast.error(t("payment.waafiNeedProfilePhone"));
      return;
    }
    setSubmitting(true);
    try {
      await purchase({ accountNo: fullAccountNo, tier: "basic" });
      toast.success(t("payment.waafiSuccess"));
      await refreshProfile();
      router.replace("/matches");
    } catch (error) {
      toast.error(getSafeUserError(error, t("payment.waafiFailed")));
    } finally {
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
            {t("payment.waafiBadge")}
          </div>
          <h2 className="font-display text-3xl sm:text-4xl tracking-tight text-foreground">
            {t("payment.waafiTitle")}
          </h2>
          <p className="max-w-md text-sm sm:text-[15px] leading-relaxed text-muted-foreground sm:mx-0 mx-auto">
            {t("payment.waafiSubtitle", { price: priceLabel })}
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
              {t("payment.waafiPeriodNote", { price: priceLabel })}
            </p>
          </div>
          <div className="hidden sm:flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Lock className="h-5 w-5" />
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {t("payment.waafiWalletsTitle")}
          </p>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {WAAFI_WALLETS.map((wallet) => (
              <li
                key={wallet.key}
                title={t(wallet.key)}
                className={cn(
                  "flex h-11 items-center justify-center rounded-xl border border-border/80",
                  "bg-background/90 px-2 text-center text-[11px] font-semibold tracking-wide",
                  "text-foreground/85 transition-colors duration-200 hover:border-primary/35 hover:text-primary"
                )}
              >
                {wallet.short}
              </li>
            ))}
          </ul>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("payment.waafiWalletsNote")}
          </p>
        </div>

        {!profilePhone ? (
          <div className="rounded-2xl border border-amber-400/40 bg-amber-50/90 px-4 py-4 space-y-3 dark:border-amber-700/50 dark:bg-amber-950/40">
            <p className="text-sm leading-relaxed text-foreground/90">
              {t("payment.waafiNeedProfilePhone")}
            </p>
            <Button asChild variant="outline" className="w-full sm:w-auto rounded-xl">
              <Link href="/profile">{t("payment.waafiUpdatePhone")}</Link>
            </Button>
          </div>
        ) : null}

        <form onSubmit={onPay} className="space-y-5">
          <div className="space-y-2.5">
            <Label
              htmlFor="waafi-account"
              className="text-sm font-semibold tracking-tight"
            >
              {t("payment.waafiAccountLabel")}
            </Label>
            <div
              className={cn(
                "flex h-14 overflow-hidden rounded-2xl border bg-background transition-all duration-200",
                focused
                  ? "border-primary/50 shadow-[0_0_0_4px_color-mix(in_srgb,var(--primary)_14%,transparent)]"
                  : "border-border/90 shadow-sm"
              )}
            >
              <span
                className="flex shrink-0 items-center gap-2 border-r border-border/80 bg-muted/40 px-4 font-mono text-[15px] font-semibold tracking-wide text-foreground"
                aria-hidden
              >
                <Phone className="h-4 w-4 text-primary" />
                +{WAAFI_COUNTRY_CODE}
              </span>
              <Input
                id="waafi-account"
                value={localMobile}
                onChange={(e) => setLocalMobile(toLocalMobileDigits(e.target.value))}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder={t("payment.waafiAccountPlaceholder")}
                inputMode="numeric"
                autoComplete="tel-national"
                required
                minLength={8}
                maxLength={12}
                disabled={submitting || profile === undefined}
                className={cn(
                  "h-full flex-1 border-0 bg-transparent px-4 font-mono text-[17px] tracking-[0.08em] shadow-none",
                  "placeholder:tracking-normal placeholder:text-muted-foreground/70",
                  "focus-visible:ring-0 focus-visible:ring-offset-0"
                )}
              />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("payment.waafiAccountHint")}
            </p>
          </div>

          <Button
            type="submit"
            size="lg"
            className={cn(
              "h-14 w-full rounded-2xl text-[15px] font-semibold tracking-wide",
              "shadow-lg shadow-primary/20 transition-transform duration-200",
              canPay && "hover:scale-[1.01] active:scale-[0.99]"
            )}
            disabled={!canPay}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("payment.waafiPaying")}
              </>
            ) : (
              t("payment.waafiPay", { price: priceLabel })
            )}
          </Button>

          <div className="flex items-start gap-2.5 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p>
              <span className="font-medium text-foreground/80">
                {t("payment.waafiSecureNote")}
              </span>{" "}
              {t("payment.waafiPinNote")}
            </p>
          </div>
        </form>
      </div>
    </section>
  );
}
