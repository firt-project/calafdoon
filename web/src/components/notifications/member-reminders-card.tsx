"use client";

import Link from "next/link";
import {
  ArrowRight,
  ClipboardList,
  CreditCard,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useMemberReminders } from "@/data/notifications/hooks";
import type { MemberReminder, MemberReminderId } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/context";
import { reminderCopy } from "@/lib/reminder-copy";

const reminderIcons: Record<MemberReminderId, typeof ClipboardList> = {
  "complete-profile": ClipboardList,
  "complete-payment": CreditCard,
  "free-trial-active": Sparkles,
  "pending-approval": ShieldCheck,
  "browse-matches": Search,
};

const reminderColors: Record<MemberReminderId, string> = {
  "complete-profile": "text-primary bg-accent",
  "complete-payment": "text-primary bg-primary/10",
  "free-trial-active": "text-violet-600 bg-violet-50 dark:bg-violet-950/30 dark:text-violet-400",
  "pending-approval": "text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400",
  "browse-matches": "text-primary bg-accent dark:bg-primary/20",
};

export function MemberRemindersCard() {
  const { t } = useTranslation();
  const remindersRaw = useMemberReminders();
  const reminders = Array.isArray(remindersRaw)
    ? (remindersRaw as MemberReminder[])
    : [];

  if (!reminders.length) return null;

  return (
    <div className="space-y-3">
      {reminders.map((reminder) => {
        const Icon = reminderIcons[reminder.id];
        const colorClass = reminderColors[reminder.id];
        const copy = reminderCopy[reminder.id];
        return (
          <Card key={reminder.id} className="border-primary/20 bg-primary/5">
            <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-start gap-4 flex-1 min-w-0">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${colorClass}`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold">{t(copy.title)}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t(copy.body)}
                  </p>
                </div>
              </div>
              <Button className="shrink-0" asChild>
                <Link href={reminder.href}>
                  {t(copy.action)}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
