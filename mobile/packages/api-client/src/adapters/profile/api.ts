import { apiClient } from "../api-client";
import type { ProfileAdapter } from "./types";

export const apiProfile: ProfileAdapter = {
  async getProfile() {
    const res = await apiClient.get<{ profile: unknown }>("/profile/me");
    return res?.profile ?? null;
  },
  async updateProfile(patch) {
    return apiClient.patch("/profile/me", patch);
  },
  async ensureProfile() {
    const res = await apiClient.post<{ profile: unknown }>("/profile/ensure", {});
    return res?.profile ?? null;
  },
  async completeRegistrationGender(gender) {
    // Phase 11: /auth/register/complete aliases the profile gender step.
    return apiClient.post("/auth/register/complete", { gender });
  },
  async getAccessState() {
    return apiClient.get("/profile/access-state");
  },
  async getShareableCard(publicId) {
    return apiClient.get(
      `/profile/shareable/${encodeURIComponent(publicId)}`
    );
  },
  async getWali() {
    return apiClient.get<{ waliName: string | null; waliPhone: string | null }>(
      "/profile/wali"
    );
  },
  async updateWali(data) {
    return apiClient.patch<{ waliName: string | null; waliPhone: string | null }>(
      "/profile/wali",
      data
    );
  },
};
