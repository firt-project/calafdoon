"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Heart,
  MessageCircle,
  Users,
  Megaphone,
  CheckCheck,
  ShieldCheck,
  CreditCard,
  Bell,
} from "lucide-react";
import type { MemberReminder, Notification } from "@/types";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DataLoadError } from "@/components/ui/data-load-error";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDate } from "@/lib/utils";
import { reminderCopy } from "@/lib/reminder-copy";
import { useTranslation } from "@/lib/i18n/context";
import {
  useNotificationsList,
  useMemberReminders,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "@/data/notifications/hooks";

const typeIcons = {
  like: Heart,
  match: Users,
  message: MessageCircle,
  announcement: Megaphone,
  approval: ShieldCheck,
  payment: CreditCard,
};

const typeColors = {
  like: "text-primary bg-accent",
  match: "text-primary bg-accent dark:bg-primary/20",
  message: "text-sky-700 bg-sky-50 dark:bg-sky-950/30 dark:text-sky-400",
  announcement:
    "text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300",
  approval: "text-primary bg-primary/10",
  payment:
    "text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400",
};

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getNotificationHref(notification: Notification): string | null {
  switch (notification.type) {
    case "message":
      return "/chat";
    case "like":
      return "/likes?tab=likedYou";
    case "match":
      return "/chat?list=new";
    case "approval":
      return "/matches";
    case "payment":
      return "/payment";
    case "announcement":
      return null;
    default:
      return null;
  }
}

type NotifGroup = "unread" | "today" | "yesterday" | "earlier";

function groupNotifications(notifications: Notification[]) {
  const now = Date.now();
  const today = startOfDay(now);
  const yesterday = today - 24 * 60 * 60 * 1000;

  const groups: Record<NotifGroup, Notification[]> = {
    unread: [],
    today: [],
    yesterday: [],
    earlier: [],
  };

  for (const n of notifications) {
    if (!n.read) {
      groups.unread.push(n);
      continue;
    }
    const day = startOfDay(n.createdAt);
    if (day === today) groups.today.push(n);
    else if (day === yesterday) groups.yesterday.push(n);
    else groups.earlier.push(n);
  }

  return groups;
}

export default function NotificationsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const {
    notifications: notificationsRaw,
    error: notificationsError,
    refresh: refreshNotifications,
  } = useNotificationsList();
  const remindersRaw = useMemberReminders();
  const notifications = Array.isArray(notificationsRaw)
    ? (notificationsRaw as Notification[])
    : undefined;
  const reminders = Array.isArray(remindersRaw)
    ? (remindersRaw as MemberReminder[])
    : [];
  const markAsRead = useMarkNotificationRead();
  const markAllAsRead = useMarkAllNotificationsRead();
  const markedAllRef = useRef(false);

  const unreadCount = notifications?.filter((n) => !n.read).length ?? 0;
  const groups = useMemo(
    () => (notifications ? groupNotifications(notifications) : null),
    [notifications]
  );

  useEffect(() => {
    if (notifications === undefined || markedAllRef.current) return;
    if (!notifications.some((n) => !n.read)) return;
    markedAllRef.current = true;
    void markAllAsRead();
  }, [notifications, markAllAsRead]);

  if (notificationsError && notifications === undefined) {
    return (
      <DashboardLayout>
        <DataLoadError
          message={notificationsError}
          onRetry={() => void refreshNotifications()}
        />
      </DashboardLayout>
    );
  }

  if (notifications === undefined) {
    return (
      <DashboardLayout>
        <div className="space-y-4 max-w-2xl">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </DashboardLayout>
    );
  }

  const renderNotification = (notification: Notification, i: number) => {
    const Icon = typeIcons[notification.type];
    const colorClass = typeColors[notification.type];
    const href = getNotificationHref(notification);

    return (
      <motion.div
        key={notification._id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(i * 0.03, 0.3) }}
      >
        <Card
          className={`cursor-pointer transition-all hover:shadow-md ${
            !notification.read ? "border-primary/30 bg-accent/30" : ""
          }`}
          onClick={() => {
            if (!notification.read) {
              markAsRead({ notificationId: notification._id });
            }
            if (href) {
              router.push(href);
            }
          }}
        >
          <CardContent className="p-4 flex items-start gap-4">
            {notification.relatedImageUrl ? (
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarImage src={notification.relatedImageUrl} alt="" />
                <AvatarFallback className="bg-muted">
                  <Icon className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
            ) : (
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${colorClass}`}
              >
                <Icon className="h-5 w-5" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold">{notification.title}</p>
                {!notification.read && (
                  <Badge variant="success" className="text-[10px]">
                    {t("notificationsPage.new")}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {notification.body}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                {formatDate(notification.createdAt)}
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  };

  const sections: { key: NotifGroup; label: string; items: Notification[] }[] =
    groups
      ? [
          {
            key: "unread",
            label: t("notificationsPage.groupUnread"),
            items: groups.unread,
          },
          {
            key: "today",
            label: t("notificationsPage.groupToday"),
            items: groups.today,
          },
          {
            key: "yesterday",
            label: t("notificationsPage.groupYesterday"),
            items: groups.yesterday,
          },
          {
            key: "earlier",
            label: t("notificationsPage.groupEarlier"),
            items: groups.earlier,
          },
        ]
      : [];

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold tracking-tight">
            {t("notificationsPage.title")}
          </h1>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={() => markAllAsRead()}>
              <CheckCheck className="h-4 w-4 mr-2" />
              {t("notificationsPage.markAllRead")}
            </Button>
          )}
        </div>

        {reminders.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {t("notificationsPage.reminders")}
            </h2>
            {reminders.map((reminder) => {
              const copy = reminderCopy[reminder.id];
              return (
                <Card key={reminder.id} className="border-primary/20 bg-primary/5">
                  <CardContent className="p-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold">{t(copy.title)}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {t(copy.body)}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" asChild>
                      <Link href={reminder.href}>{t(copy.action)}</Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {notifications.length === 0 ? (
          <Card className="p-12 text-center">
            <Bell className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-lg font-bold mb-2">
              {t("notificationsPage.emptyTitle")}
            </h3>
            <p className="text-muted-foreground text-sm">
              {t("notificationsPage.emptyDesc")}
            </p>
          </Card>
        ) : (
          <div className="space-y-6">
            {sections.map((section) =>
              section.items.length === 0 ? null : (
                <div key={section.key} className="space-y-3">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    {section.label}
                  </h2>
                  {section.items.map((n, i) => renderNotification(n, i))}
                </div>
              )
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
