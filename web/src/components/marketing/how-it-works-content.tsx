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
    <div className="space-y-5 max-w-3xl mx-auto">
      {steps.map((step, i) => (
        <Card key={step.title} className="overflow-hidden rounded-3xl border-border/80 shadow-sm">
          <CardContent className="flex gap-6 p-6 sm:p-8">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-primary dark:bg-primary/20">
              <step.icon className="h-6 w-6" />
            </div>
            <div>
              <div className="mb-1 text-sm font-semibold text-primary">
                {t("howItWorks.stepLabel", { num: i + 1 })}
              </div>
              <h3 className="mb-2 text-lg font-bold">{step.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{step.description}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
