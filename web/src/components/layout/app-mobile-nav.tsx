"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Heart,
  MessageCircle,
  Sparkles,
  ClipboardList,
  Users,
  User,
} from "lucide-react";
import { useUnifiedAuth } from "@/data/auth/hooks";
import { usePreferencesQuery } from "@/data/profile/hooks";
import { useAppNavLinks } from "@/lib/i18n/hooks";
import { useTranslation } from "@/lib/i18n/context";
import { isStaffRole } from "@/lib/access";
import { cn } from "@/lib/utils";
import { calculateProfileProgress } from "@/lib/profile-progress";

const iconMap = {
  LayoutDashboard,
  Heart,
  MessageCircle,
  Sparkles,
  ClipboardList,
};

type TabIcon = keyof typeof iconMap;

export function AppMobileNav() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { user } = useUnifiedAuth();
  const isLoading = user === undefined;
  const profile = user?.profile as
    | {
        role?: string;
        questionnaireComplete?: boolean;
        [key: string]: unknown;
      }
    | null
    | undefined;
  const isStaff = isStaffRole(profile?.role);
  const preferences = usePreferencesQuery();
  const profileComplete = profile?.questionnaireComplete ?? false;
  const profileProgress = profile
    ? calculateProfileProgress(
        profile as unknown as Parameters<typeof calculateProfileProgress>[0],
        !isStaff && preferences
          ? (preferences as unknown as Parameters<
              typeof calculateProfileProgress
            >[1])
          : undefined
      )
    : 0;
  const appNavLinks = useAppNavLinks(profileComplete).filter((l) => l.tab);

  if (isLoading) {
    return (
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch justify-around px-1 py-2.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div className="h-5 w-5 rounded bg-muted animate-pulse" aria-hidden />
              <div className="h-2.5 w-10 rounded bg-muted animate-pulse" aria-hidden />
            </div>
          ))}
        </div>
      </nav>
    );
  }

  if (isStaff) {
    // On /admin the in-page tab strip is the full menu — don't duplicate a second menu.
    if (pathname.startsWith("/admin")) {
      return null;
    }

    // Off admin routes (e.g. profile): short shortcuts back into the console.
    return (
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch justify-around px-0.5">
          <Link
            href="/admin?tab=dashboard"
            className="flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 px-0.5 py-2 text-muted-foreground transition-colors"
          >
            <LayoutDashboard className="h-5 w-5" />
            <span className="text-center text-[10px] font-medium leading-none">
              {t("adminPage.dashboard")}
            </span>
          </Link>
          <Link
            href="/admin?tab=messages"
            className="flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 px-0.5 py-2 text-muted-foreground transition-colors"
          >
            <MessageCircle className="h-5 w-5" />
            <span className="text-center text-[10px] font-medium leading-none">
              {t("adminPage.messagesTab")}
            </span>
          </Link>
          <Link
            href="/admin?tab=users"
            className="flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 px-0.5 py-2 text-muted-foreground transition-colors"
          >
            <Users className="h-5 w-5" />
            <span className="text-center text-[10px] font-medium leading-none">
              {t("adminPage.users")}
            </span>
          </Link>
          <Link
            href="/profile"
            className={cn(
              "flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 px-0.5 py-2 transition-colors",
              pathname === "/profile" ? "text-primary" : "text-muted-foreground"
            )}
          >
            <User className={cn("h-5 w-5", pathname === "/profile" && "stroke-[2.5]")} />
            <span className="text-center text-[10px] font-medium leading-none">
              {t("app.myProfile")}
            </span>
          </Link>
        </div>
      </nav>
    );
  }

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-stretch justify-around px-1">
        {appNavLinks.map((link) => {
          const Icon = iconMap[link.icon as TabIcon];
          const isActive =
            pathname === link.href ||
            (link.href === "/dashboard" && pathname === "/dashboard") ||
            (link.href === "/likes" && pathname.startsWith("/likes")) ||
            (!profileComplete &&
              link.href === "/questionnaire" &&
              pathname.startsWith("/questionnaire"));
          const isLocked = "locked" in link && link.locked && !profileComplete;
          const showProgressBadge =
            !profileComplete && link.href === "/questionnaire";

          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "relative flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-1 py-2.5 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground",
                isLocked && "opacity-90"
              )}
            >
              <Icon className={cn("h-5 w-5", isActive && "stroke-[2.5]")} />
              <span className="text-[11px] font-medium leading-none">
                {"mobileLabel" in link && link.mobileLabel
                  ? link.mobileLabel
                  : link.label}
              </span>
              {showProgressBadge && profileProgress > 0 && (
                <span className="absolute top-1.5 right-[calc(50%-1.35rem)] min-w-[1.35rem] rounded-full bg-primary px-1 py-0.5 text-[9px] font-bold leading-none text-primary-foreground">
                  {profileProgress}%
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
