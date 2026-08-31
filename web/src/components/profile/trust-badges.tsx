"use client";

import { BadgeCheck, ClipboardCheck, Clock, CreditCard, Headphones, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n/context";
import { resolveReviewStatus, type ReviewStatus } from "@/lib/review-status";
import { cn } from "@/lib/utils";

export interface TrustBadgeProfile {
  verified?: boolean;
  approved?: boolean;
  reviewStatus?: ReviewStatus | string;
  hasPaid?: boolean;
  hasPersonalSupport?: boolean;
  advisorReviewed?: boolean;
  questionnaireComplete?: boolean;
  banned?: boolean;
  role?: string;
}

interface TrustBadgesProps {
  profile: TrustBadgeProfile;
  size?: "sm" | "md";
  className?: string;
}

export function TrustBadges({ profile, size = "md", className }: TrustBadgesProps) {
  const { t } = useTranslation();
  const compact = size === "sm";
  const reviewStatus = resolveReviewStatus(profile);

  const badges = [
    reviewStatus === "approved"
      ? {
          key: "approved",
          label: t("trustBadges.approved"),
          icon: BadgeCheck,
          className:
            "bg-primary/10 text-primary border-primary/20",
        }
      : null,
    reviewStatus === "pending_review"
      ? {
          key: "pending",
          label: t("trustBadges.pendingReview"),
          icon: Clock,
          className:
            "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200/60 dark:border-amber-900/40",
        }
      : null,
    profile.hasPersonalSupport
      ? {
          key: "premium",
          label: t("trustBadges.premium"),
          icon: Sparkles,
          className:
            "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border-amber-200/60 dark:border-amber-900/40",
        }
      : null,
    profile.advisorReviewed
      ? {
          key: "advisor",
          label: t("trustBadges.advisorReviewed"),
          icon: Headphones,
          className:
            "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 border-sky-200/60 dark:border-sky-900/40",
        }
      : null,
    profile.hasPaid && !profile.hasPersonalSupport
      ? {
          key: "paid",
          label: t("trustBadges.paidMember"),
          icon: CreditCard,
          className:
            "bg-primary/10 text-primary border-primary/20",
        }
      : null,
    profile.questionnaireComplete && reviewStatus !== "approved"
      ? {
          key: "complete",
          label: t("trustBadges.profileComplete"),
          icon: ClipboardCheck,
          className:
            "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-300 border-slate-200/60 dark:border-slate-800/40",
        }
      : null,
  ].filter((badge): badge is NonNullable<typeof badge> => badge !== null);

  if (badges.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {badges.map((badge) => (
        <Badge
          key={badge.key}
          variant="outline"
          className={cn(
            "font-semibold border",
            compact ? "text-[10px] px-2 py-0.5" : "text-xs",
            badge.className
          )}
        >
          <badge.icon className={cn("mr-1", compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
          {badge.label}
        </Badge>
      ))}
    </div>
  );
}
