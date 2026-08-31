"use client";

import { useCallback, useMemo } from "react";
import { useApiAuth } from "@/components/auth/api-auth-provider";
import { disconnectRealtime } from "@/data/realtime/socket-client";
import { apiAuth } from "./api";
import type { LoginResult } from "./types";
import type { SessionUser } from "@/data/types";

export type UnifiedAuth = {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: SessionUser | null | undefined;
  signOut: () => Promise<void>;
  login?: (email: string, password: string) => Promise<void>;
  register?: (email: string, password: string) => Promise<LoginResult | void>;
  checkEmail?: (email: string) => Promise<{ available: boolean }>;
  refresh?: () => Promise<void>;
};

export function useUnifiedAuth(): UnifiedAuth {
  const apiAuthCtx = useApiAuth();
  const signOut = useCallback(async () => {
    await apiAuthCtx.logout();
    disconnectRealtime();
  }, [apiAuthCtx]);

  return useMemo(
    () => ({
      isAuthenticated: apiAuthCtx.isAuthenticated,
      isLoading: apiAuthCtx.isLoading,
      user: apiAuthCtx.user,
      signOut,
      login: apiAuthCtx.login,
      register: apiAuthCtx.register,
      checkEmail: (email: string) => apiAuth.checkEmail(email),
      refresh: apiAuthCtx.refresh,
    }),
    [apiAuthCtx, signOut]
  );
}

export function useChangePassword() {
  return useCallback(
    async (args: { currentPassword: string; newPassword: string }) =>
      apiAuth.changePassword(args.currentPassword, args.newPassword),
    []
  );
}
