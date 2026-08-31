import { apiClient } from "../api-client";
import type { ModerationAdapter } from "./types";

export const apiModeration: ModerationAdapter = {
  async blockUser(userId, reason) {
    return apiClient.post("/moderation/block", { userId, reason });
  },
  async unblockUser(userId) {
    return apiClient.delete(`/moderation/block/${encodeURIComponent(userId)}`);
  },
  async reportUser(body) {
    return apiClient.post("/moderation/report", body);
  },
  async listMyBlocks() {
    return apiClient.get("/moderation/blocks");
  },
};
