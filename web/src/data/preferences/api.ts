import { apiClient } from "../api-client";
import type { PreferencesAdapter } from "./types";

export const apiPreferences: PreferencesAdapter = {
  async getPreferences() {
    const res = await apiClient.get<{ preferences: unknown }>("/preferences/me");
    return res?.preferences ?? null;
  },
  async updatePreferences(patch) {
    const res = await apiClient.patch<{ preferences: unknown }>(
      "/preferences/me",
      patch
    );
    return res?.preferences ?? null;
  },
};
