"use client";

import Link from "next/link";
import { Headphones, MessageCircle, Search, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PREMIUM_UPGRADE_PRICE, WHATSAPP_URL } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/context";
import { PremiumUpgradeButton } from "@/components/premium/premium-upgrade-button";

interface PremiumSupportCardProps {
  isPremium: boolean;
  hasPaid: boolean;
  advisorReviewed?: boolean;
  /** Women on free basic (or anyone with access) still see the Premium upgrade. */
  canUpgrade?: boolean;
  /** Display price for upgrade CTA ($15 from Basic). */
  upgradePrice?: number;
}

export function PremiumSupportCard({
  isPremium,
  hasPaid,
  advisorReviewed,
  canUpgrade = false,
  upgradePrice = PREMIUM_UPGRADE_PRICE,
}: PremiumSupportCardProps) {
  const { t } = useTranslation();

  if (isPremium) {
    return (
      <Card className="border-primary/25 bg-gradient-to-br from-primary/5 to-card">
        <CardContent className="p-5 sm:p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold">{t("premium.activeTitle")}</p>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                {advisorReviewed
                  ? t("premium.activeReviewedDesc")
                  : t("premium.activeDesc")}
              </p>
            </div>
          </div>
          <ul className="text-sm text-muted-foreground space-y-1.5">
            <li className="flex gap-2">
              <MessageCircle className="h-4 w-4 shrink-0 text-primary mt-0.5" />
              {t("premium.featureWhatsApp")}
            </li>
            <li className="flex gap-2">
              <Search className="h-4 w-4 shrink-0 text-primary mt-0.5" />
              {t("premium.featureSearchHelp")}
            </li>
          </ul>
          <Button asChild className="w-full rounded-xl">
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="h-4 w-4 mr-2" />
              {t("payment.premiumWhatsApp")}
            </a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Unpaid members must use registration checkout on /payment — not the upgrade action.
  if (!hasPaid) {
    return (
      <Card className="border-primary/20">
        <CardContent className="p-5 sm:p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Headphones className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold">{t("premium.upgradeTitle")}</p>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                {t("premium.upgradeDesc")}
              </p>
            </div>
          </div>
          <Button asChild className="w-full rounded-xl">
            <Link href="/payment">{t("dashboard.choosePlan")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!canUpgrade) return null;

  return (
    <Card className="border-primary/20">
      <CardContent className="p-5 sm:p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Headphones className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold">{t("premium.upgradeTitle")}</p>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              {t("premium.upgradeDesc")}
            </p>
          </div>
        </div>
        <ul className="text-sm text-muted-foreground space-y-1.5">
          <li>• {t("premium.featureWhatsApp")}</li>
          <li>• {t("premium.featureSearchHelp")}</li>
        </ul>
        <PremiumUpgradeButton className="w-full rounded-xl" price={upgradePrice} />
        <Button variant="link" className="w-full text-xs" asChild>
          <Link href="/pricing">{t("premium.comparePlans")}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
