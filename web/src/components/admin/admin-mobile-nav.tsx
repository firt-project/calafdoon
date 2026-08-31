"use client";

import { useEffect, useState } from "react";
import { Ellipsis, X } from "lucide-react";
import {
  ADMIN_MOBILE_MORE_TABS,
  ADMIN_MOBILE_PRIMARY_TABS,
  ADMIN_NAV_TABS,
  isAdminMobilePrimaryTab,
  type AdminNavTab,
} from "@/lib/admin-nav";
import { useTranslation } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

interface AdminMobileNavProps {
  activeTab: AdminNavTab;
  onSelectTab: (tab: AdminNavTab) => void;
  hidden?: boolean;
}

export function AdminMobileNav({
  activeTab,
  onSelectTab,
  hidden = false,
}: AdminMobileNavProps) {
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = !isAdminMobilePrimaryTab(activeTab);

  useEffect(() => {
    if (!moreOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [moreOpen]);

  if (hidden) return null;

  const tabMeta = (tab: AdminNavTab) =>
    ADMIN_NAV_TABS.find((item) => item.tab === tab)!;

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
        aria-label={t("app.admin")}
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-around px-1">
          {ADMIN_MOBILE_PRIMARY_TABS.map((tab) => {
            const meta = tabMeta(tab);
            const Icon = meta.icon;
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  onSelectTab(tab);
                }}
                className={cn(
                  "flex min-h-[3.5rem] flex-1 flex-col items-center justify-center gap-1 px-1 py-2 transition-colors",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className={cn("h-5 w-5", active && "stroke-[2.5]")} />
                <span className="text-[11px] font-semibold leading-none">
                  {t(meta.titleKey)}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex min-h-[3.5rem] flex-1 flex-col items-center justify-center gap-1 px-1 py-2 transition-colors",
              moreActive || moreOpen ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Ellipsis className={cn("h-5 w-5", (moreActive || moreOpen) && "stroke-[2.5]")} />
            <span className="text-[11px] font-semibold leading-none">
              {t("adminPage.moreMenu")}
            </span>
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label={t("common.a11yClose")}
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[78vh] overflow-hidden rounded-t-3xl border border-border bg-card shadow-[var(--shadow-lg)]">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <p className="text-base font-semibold tracking-tight">
                  {t("adminPage.moreMenuTitle")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("adminPage.moreMenuHint")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-foreground"
                aria-label={t("common.a11yClose")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
              <ul className="space-y-1">
                {ADMIN_MOBILE_MORE_TABS.map((tab) => {
                  const meta = tabMeta(tab);
                  const Icon = meta.icon;
                  const active = activeTab === tab;
                  return (
                    <li key={tab}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectTab(tab);
                          setMoreOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-colors",
                          active
                            ? "bg-primary/10 text-primary"
                            : "text-foreground hover:bg-muted"
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-10 w-10 items-center justify-center rounded-xl",
                            active ? "bg-primary/15" : "bg-muted"
                          )}
                        >
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">
                            {t(meta.titleKey)}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {t(meta.descKey)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
