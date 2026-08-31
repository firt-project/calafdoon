import { apiClient } from "../api-client";
import type { SupportAdapter } from "./types";

export const apiSupport: SupportAdapter = {
  async listMine() {
    return apiClient.get("/support/me");
  },
  async getMine(contactId) {
    return apiClient.get(`/support/me/${encodeURIComponent(contactId)}`);
  },
  async create(body) {
    return apiClient.post("/support", body);
  },
  async replyAsMember(contactId, message) {
    return apiClient.post(`/support/${encodeURIComponent(contactId)}/message`, {
      message,
    });
  },
  admin: {
    async list(opts) {
      const params = new URLSearchParams();
      if (opts) {
        for (const [k, v] of Object.entries(opts)) {
          if (v != null) params.set(k, String(v));
        }
      }
      const q = params.toString();
      return apiClient.get(`/admin/support${q ? `?${q}` : ""}`);
    },
    async get(contactId) {
      return apiClient.get(`/admin/support/${encodeURIComponent(contactId)}`);
    },
    async reply(contactId, message) {
      return apiClient.post(
        `/admin/support/${encodeURIComponent(contactId)}/reply`,
        { message }
      );
    },
    async updateStatus(contactId, status) {
      return apiClient.post(
        `/admin/support/${encodeURIComponent(contactId)}/status`,
        { status }
      );
    },
  },
  async sendPublicContact(body) {
    return apiClient.post("/support/public", body);
  },
};
