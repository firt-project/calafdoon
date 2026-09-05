"use client";

import {
  UserPlus,
  ClipboardList,
  Heart,
  MessageCircle,
  Shield,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n/context";

export function HowItWorksContent() {
  const { t } = useTranslation();

  const steps = [
    { icon: UserPlus, title: t("howItWorks.step1"), description: t("howItWorks.step1Desc") },
    { icon: ClipboardList, title: t("howItWorks.step2"), description: t("howItWorks.step2Desc") },
    { icon: Heart, title: t("howItWorks.step3"), description: t("howItWorks.step3Desc") },
    { icon: MessageCircle, title: t("howItWorks.step4"), description: t("howItWorks.step4Desc") },
    { icon: Shield, title: t("howItWorks.step5"), description: t("howItWorks.step5Desc") },
  ];

  return (
    <div className="max-w-3xl space-y-4">
      {steps.map((step, i) => (
        <Card key={step.title} className="overflow-hidden shadow-sm">
          <CardContent className="flex gap-5 p-6 sm:gap-6 sm:p-8">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.7rem] border border-border text-primary">
              <step.icon className="h-5 w-5" />
            </div>
            <div>
              <div className="mb-1 font-mono text-[0.72rem] font-medium uppercase tracking-[0.1em] text-gold">
                {t("howItWorks.stepLabel", { num: i + 1 })}
              </div>
              <h3 className="mb-2 font-display text-lg font-semibold tracking-tight">
                {step.title}
              </h3>
              <p className="leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
