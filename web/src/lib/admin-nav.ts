import type { TranslationPath } from "@/lib/i18n/translations";
import type { LucideIcon } from "lucide-react";
import {
  ClipboardList,
  CreditCard,
  Flag,
  Headphones,
  LayoutDashboard,
  Megaphone,
  MessageCircle,
  Settings,
  TrendingUp,
  Users,
} from "lucide-react";

/** Single source of truth for admin tabs — desktop sidebar + mobile must match. */
export const ADMIN_NAV_TABS = [
  {
    tab: "dashboard",
    titleKey: "adminPage.dashboard" as TranslationPath,
    descKey: "adminPage.dashboardDesc" as TranslationPath,
    icon: LayoutDashboard,
  },
  {
    tab: "users",
    titleKey: "adminPage.users" as TranslationPath,
    descKey: "adminPage.usersDesc" as TranslationPath,
    icon: Users,
  },
  {
    tab: "messages",
    titleKey: "adminPage.messagesTab" as TranslationPath,
    descKey: "adminPage.messagesTabDesc" as TranslationPath,
    icon: MessageCircle,
  },
  {
    tab: "contacts",
    titleKey: "adminPage.contactsTab" as TranslationPath,
    descKey: "adminPage.contactsTabDesc" as TranslationPath,
    icon: Headphones,
  },
  {
    tab: "reports",
    titleKey: "adminPage.reports" as TranslationPath,
    descKey: "adminPage.reportsDesc" as TranslationPath,
    icon: Flag,
  },
  {
    tab: "payments",
    titleKey: "adminPage.payments" as TranslationPath,
    descKey: "adminPage.paymentsDesc" as TranslationPath,
    icon: CreditCard,
  },
  {
    tab: "announcements",
    titleKey: "adminPage.announcements" as TranslationPath,
    descKey: "adminPage.announcementsDesc" as TranslationPath,
    icon: Megaphone,
  },
  {
    tab: "analytics",
    titleKey: "adminPage.analytics" as TranslationPath,
    descKey: "adminPage.analyticsDesc" as TranslationPath,
    icon: TrendingUp,
  },
  {
    tab: "audit",
    titleKey: "adminPage.auditLogs" as TranslationPath,
    descKey: "adminPage.auditLogsDesc" as TranslationPath,
    icon: ClipboardList,
  },
  {
    tab: "settings",
    titleKey: "adminPage.settings" as TranslationPath,
    descKey: "adminPage.settingsDesc" as TranslationPath,
    icon: Settings,
  },
] as const satisfies ReadonlyArray<{
  tab: string;
  titleKey: TranslationPath;
  descKey: TranslationPath;
  icon: LucideIcon;
}>;

export type AdminNavTab = (typeof ADMIN_NAV_TABS)[number]["tab"];

export const ADMIN_NAV_TAB_IDS = ADMIN_NAV_TABS.map((t) => t.tab) as AdminNavTab[];

/** Primary phone bottom bar — keep to 3 + More for thumb reach. */
export const ADMIN_MOBILE_PRIMARY_TABS = [
  "dashboard",
  "users",
  "messages",
] as const satisfies ReadonlyArray<AdminNavTab>;

export const ADMIN_MOBILE_MORE_TABS = [
  "contacts",
  "reports",
  "payments",
  "announcements",
  "analytics",
  "audit",
  "settings",
] as const satisfies ReadonlyArray<AdminNavTab>;

export function isAdminNavTab(value: string | null | undefined): value is AdminNavTab {
  return !!value && (ADMIN_NAV_TAB_IDS as string[]).includes(value);
}

export function isAdminMobilePrimaryTab(tab: AdminNavTab): boolean {
  return (ADMIN_MOBILE_PRIMARY_TABS as readonly string[]).includes(tab);
}
