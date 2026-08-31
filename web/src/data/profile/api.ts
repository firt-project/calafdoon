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
  async deleteAccount(password: string) {
    // Prefer POST — some proxies strip DELETE bodies, which made password checks fail.
    return apiClient.post("/auth/delete-account", {
      password,
      confirm: true,
    });
  },
};
