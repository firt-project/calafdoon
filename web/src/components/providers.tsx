"use client";

import { useEffect, type ReactNode } from "react";
import { ThemeProvider } from "./theme-provider";
import { Toaster } from "sonner";
import { IdleSessionGuard } from "@/components/auth/idle-session-guard";
import { ApiAuthProvider } from "@/components/auth/api-auth-provider";
import { ForcedPasswordResetGate } from "@/components/auth/forced-password-reset-gate";
import { EmailVerificationGate } from "@/components/auth/email-verification-gate";
import { MfaEnrollmentGate } from "@/components/auth/mfa-enrollment-gate";
import { LanguageProvider } from "@/lib/i18n/context";
import { PresenceProvider } from "@/data/presence/hooks";
import { validateFrontendEnv } from "@/data/env";

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    const report = validateFrontendEnv();
    if (!report.ok && process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.error("[frontend-env]", report.errors);
    }
  }, []);

  return (
    <ApiAuthProvider>
      <PresenceProvider>
        <LanguageProvider>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
            <IdleSessionGuard />
            <ForcedPasswordResetGate>
              <EmailVerificationGate>
                <MfaEnrollmentGate>{children}</MfaEnrollmentGate>
              </EmailVerificationGate>
            </ForcedPasswordResetGate>
            <Toaster position="top-right" richColors />
          </ThemeProvider>
        </LanguageProvider>
      </PresenceProvider>
    </ApiAuthProvider>
  );
}
