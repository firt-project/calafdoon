"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PREMIUM_UPGRADE_PRICE } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { getSafeUserError } from "@/lib/safe-error";
import { useCreatePremiumUpgradeCheckout } from "@/data/payments/hooks";

export function PremiumUpgradeButton({
  className,
  size = "default",
  variant = "default",
  price = PREMIUM_UPGRADE_PRICE,
}: {
  className?: string;
  size?: "default" | "sm" | "lg";
  variant?: "default" | "outline";
  /** Display price for Premium upgrade ($15). */
  price?: number;
}) {
  const createUpgrade = useCreatePremiumUpgradeCheckout();
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const result = await createUpgrade();
      const url = (result as { url?: string })?.url;
      if (!url) throw new Error("Missing checkout URL");
      window.location.href = url;
    } catch (error) {
      const raw = getSafeUserError(error, t("premium.upgradeFailed"));
      if (/complete basic registration/i.test(raw)) {
        toast.error(t("premium.upgradeFailed"));
        window.location.href = "/payment";
        return;
      }
      toast.error(raw);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleUpgrade}
      disabled={loading}
      size={size}
      variant={variant}
      className={cn("font-semibold", className)}
    >
      <Sparkles className="h-4 w-4 mr-2" />
      {loading
        ? t("payment.redirecting")
        : t("premium.upgradeCta", { price: String(price) })}
    </Button>
  );
}
