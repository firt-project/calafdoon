"use client";

import { useCallback } from "react";
import { apiProfile } from "./api";

export function useEnsureProfile() {
  return useCallback(async () => apiProfile.ensureProfile(), []);
}

export function useUpdateProfile() {
  return useCallback(
    async (patch: Record<string, unknown>) => apiProfile.updateProfile(patch),
    []
  );
}

export function useCompleteRegistrationGender() {
  return useCallback(
    async (gender: "male" | "female") =>
      apiProfile.completeRegistrationGender(gender),
    []
  );
}

export function useUpdateWaliContact() {
  return useCallback(
    async (data: { waliName?: string; waliPhone?: string }) =>
      apiProfile.updateProfile(data),
    []
  );
}

export function useDeleteAccount() {
  return useCallback(
    async (password: string) => apiProfile.deleteAccount(password),
    []
  );
}

// Re-export query hooks from the fuller hooks file sections
export {
  useProfile,
  usePreferencesQuery,
  usePreferences,
  useWaliForMatch,
} from "./hooks-queries";
