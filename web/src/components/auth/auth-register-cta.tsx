"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUnifiedAuth } from "@/data/auth/hooks";
import { useTranslation } from "@/lib/i18n/context";
import {
  type PlanPreference,
  registerHrefForPlan,
  savePlanPreference,
} from "@/lib/plan-preference";

type AuthRegisterCtaProps = {
  registerHref?: string;
  registerLabel: string;
  plan?: PlanPreference;
  dashboardLabel?: string;
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "secondary" | "outline" | "ghost";
};

/**
 * Never block the homepage behind auth loading ("Fadlan sug...").
 * Guests always see Join immediately; signed-in users get Dashboard once auth resolves.
 */
export function AuthRegisterCta({
  registerHref,
  registerLabel,
  plan,
  dashboardLabel,
  className,
  size = "lg",
  variant = "default",
}: AuthRegisterCtaProps) {
  const { isAuthenticated, isLoading } = useUnifiedAuth();
  const { t } = useTranslation();
  const dashboardText = dashboardLabel ?? t("common.goToDashboard");
  const href = registerHref ?? registerHrefForPlan(plan);

  const handleRegisterClick = () => {
    if (plan) savePlanPreference(plan);
  };

  if (isAuthenticated && !isLoading) {
    return (
      <Button size={size} variant={variant} className={className} asChild>
        <Link href="/matches">
          <Heart className="mr-2 h-4 w-4" />
          {dashboardText}
        </Link>
      </Button>
    );
  }

  return (
    <Button size={size} variant={variant} className={className} asChild>
      <Link href={href} onClick={handleRegisterClick}>
        {registerLabel}
      </Link>
    </Button>
  );
}
