import { apiClient } from "../api-client";
import { prepareImageForUpload } from "@/lib/strip-image-exif";
import { track } from "../telemetry";
import type { ChatAdapter } from "./types";

export const apiChat: ChatAdapter = {
  async getConversations(opts) {
    const list = opts?.list;
    const q =
      list && ["active", "new", "archived"].includes(list)
        ? `?list=${encodeURIComponent(list)}`
        : "";
    const res = await apiClient.get<{ items?: unknown } | unknown>(
      `/conversations${q}`
    );
    // Nest returns { items }; always normalize to an array for the UI.
    if (res && typeof res === "object" && "items" in res && Array.isArray(res.items)) {
      return res.items;
    }
    return Array.isArray(res) ? res : [];
  },
  async getPartnerProfile(conversationId) {
    return apiClient.get(
      `/conversations/${encodeURIComponent(conversationId)}/partner`
    );
  },
  async getMessages(conversationId, opts) {
    const params = new URLSearchParams();
    if (opts?.cursor) params.set("cursor", opts.cursor);
    if (opts?.limit) params.set("limit", String(opts.limit));
    const q = params.toString();
    const res = await apiClient.get<{ items?: unknown } | unknown>(
      `/conversations/${encodeURIComponent(conversationId)}/messages${q ? `?${q}` : ""}`,
      { signal: opts?.signal }
    );
    // Nest returns { items, nextCursor } with string ids/ISO dates;
    // the UI expects a Convex-style array of { _id, createdAt: number }.
    const list =
      res && typeof res === "object" && "items" in res && Array.isArray(res.items)
        ? res.items
        : Array.isArray(res)
          ? res
          : [];
    return list.map((raw) => {
      if (!raw || typeof raw !== "object") return raw;
      const m = raw as Record<string, unknown>;
      const createdAtRaw = m.createdAt;
      const createdAt =
        typeof createdAtRaw === "number"
          ? createdAtRaw
          : typeof createdAtRaw === "string"
            ? Date.parse(createdAtRaw) || Date.now()
            : Date.now();
      return { ...m, _id: m._id ?? m.id, createdAt };
    });
  },
  async sendMessage(conversationId, body) {
    try {
      return await apiClient.post(
        `/conversations/${encodeURIComponent(conversationId)}/messages`,
        {
          message: body.message,
          imageMediaId: body.imageMediaId,
        },
        { idempotencyKey: body.idempotencyKey }
      );
    } catch (e) {
      track("message_failure");
      throw e;
    }
  },
  async uploadChatImage(conversationId, file) {
    try {
      const prepared = await prepareImageForUpload(file);
      const contentType = prepared.type || "image/jpeg";
      const signed = await apiClient.post<{
        mediaId: string;
        uploadUrl: string;
      }>(
        `/conversations/${encodeURIComponent(conversationId)}/images/sign-upload`,
        { contentType, sizeBytes: prepared.size }
      );
      const res = await fetch(String(signed.uploadUrl), {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: prepared,
      });
      if (!res.ok) {
        track("upload_failure", { status: res.status });
        throw new Error("Upload failed. Please try a smaller JPG or PNG.");
      }
      return { mediaId: String(signed.mediaId) };
    } catch (e) {
      track("upload_failure");
      throw e;
    }
  },
  async markAsRead(conversationId) {
    return apiClient.post(
      `/conversations/${encodeURIComponent(conversationId)}/read`,
      {}
    );
  },
  async setTyping(conversationId, typing) {
    return apiClient.post(
      `/conversations/${encodeURIComponent(conversationId)}/typing`,
      { typing }
    );
  },
  async getTypingStatus(conversationId) {
    return apiClient.get(
      `/conversations/${encodeURIComponent(conversationId)}/typing`
    );
  },
};
