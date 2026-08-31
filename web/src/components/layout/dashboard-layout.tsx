"use client";

import { ReactNode, Suspense, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { AppShellHeader } from "@/components/layout/app-shell-header";
import { AppMobileNav } from "@/components/layout/app-mobile-nav";
import { TrialAccessSync } from "@/components/auth/trial-access-sync";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/context";
import { isStaffRole } from "@/lib/access";
import { cn } from "@/lib/utils";
import { useUnifiedAuth } from "@/data/auth/hooks";

const mobileNavFallback = (
  <div className="lg:hidden fixed bottom-0 left-0 right-0 h-[3.25rem] border-t border-border bg-card" />
);

const sidebarFallback = <div className="hidden lg:block lg:w-64 shrink-0" aria-hidden />;

/** Don't leave the app shell stuck on auth forever. */
const AUTH_WAIT_MS = 6_000;

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, user, signOut } = useUnifiedAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const [waitedTooLong, setWaitedTooLong] = useState(false);
  const role = (user?.profile as { role?: string } | null | undefined)?.role;
  const isStaff = isStaffRole(role);
  const adminMobileNoTabBar = isStaff && pathname.startsWith("/admin");

  useEffect(() => {
    if (!isLoading) {
      setWaitedTooLong(false);
      return;
    }
    const timer = setTimeout(() => setWaitedTooLong(true), AUTH_WAIT_MS);
    return () => clearTimeout(timer);
  }, [isLoading]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading && waitedTooLong) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <p className="text-lg font-semibold">{t("setup.connectionTimeoutTitle")}</p>
        <p className="max-w-md text-sm text-muted-foreground">
          {t("common.loadingStuck")}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            variant="outline"
            onClick={() => window.location.reload()}
          >
            {t("common.retry")}
          </Button>
          <Button
            onClick={() => {
              void signOut().finally(() => {
                window.location.assign("/login");
              });
            }}
          >
            {t("common.signInAgain")}
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen dashboard-bg flex flex-col">
        <AppShellHeader />
        <div className="flex flex-1 flex-col lg:pl-64 lg:pt-16">
          <div className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-8 space-y-4">
            <Skeleton className="h-8 w-48" aria-hidden />
            <Skeleton className="h-64 w-full max-w-3xl rounded-2xl" aria-hidden />
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen dashboard-bg flex flex-col">
      <TrialAccessSync />
      <AppShellHeader />
      <Suspense fallback={sidebarFallback}>
        <DashboardSidebar />
      </Suspense>
      <div className="flex flex-1 flex-col lg:pl-64 lg:pt-16">
        <div
          className={cn(
            "mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:pb-8",
            adminMobileNoTabBar
              ? "pb-6"
              : "pb-[calc(var(--app-tabbar)+1rem)]"
          )}
        >
          {children}
        </div>
      </div>
      <Suspense fallback={adminMobileNoTabBar ? null : mobileNavFallback}>
        <AppMobileNav />
      </Suspense>
    </div>
  );
}
