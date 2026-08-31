"use client";

import { ReactNode } from "react";
import { appShellLocale, ForcedLocaleProvider } from "@/lib/i18n/context";

export function AppEnglishShell({ children }: { children: ReactNode }) {
  return (
    <ForcedLocaleProvider locale={appShellLocale}>{children}</ForcedLocaleProvider>
  );
}
