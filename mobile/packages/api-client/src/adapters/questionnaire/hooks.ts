"use client";

import { useCallback } from "react";
import { apiClient } from "../api-client";
import { apiQuestionnaire } from "./api";

type StepDataArgs = { step: number; data: Record<string, unknown> };
type DataArgs = { data: Record<string, unknown> };

export function useUpdateQuestionnaire() {
  return useCallback(
    async (args: StepDataArgs) =>
      apiQuestionnaire.updateQuestionnaire(args.step, args.data),
    []
  );
}

export function useAutoSaveQuestionnaire() {
  return useCallback(
    async (args: StepDataArgs) =>
      apiQuestionnaire.autoSave(args.step, args.data),
    []
  );
}

export function useCompleteQuestionnaire() {
  return useCallback(
    async (data?: Record<string, unknown>) =>
      apiQuestionnaire.completeQuestionnaire(data),
    []
  );
}

export function useSaveProfileEdits() {
  return useCallback(
    async (args: DataArgs) => apiQuestionnaire.saveProfileEdits(args.data),
    []
  );
}

/** GPS verify + persist via Nest. */
export function useVerifyAndSaveLocation() {
  return useCallback(
    async (args: {
      latitude: number;
      longitude: number;
      accuracy?: number;
    }) =>
      apiClient.post<{ country: string; city: string }>(
        "/profile/geolocation/verify",
        args
      ),
    []
  );
}
