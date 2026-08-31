import { apiClient } from "../api-client";
import { prepareImageForUpload } from "@/lib/strip-image-exif";
import { track } from "../telemetry";
import type { PhotosAdapter } from "./types";

export const apiPhotos: PhotosAdapter = {
  async listMine() {
    return apiClient.get("/profile/me/photos");
  },

  async requestUploadUrl(args) {
    return apiClient.post("/profile/photos/sign-upload", {
      contentType: args.contentType,
      slot: args.slot ?? "additional",
      sizeBytes: args.sizeBytes,
    });
  },

  async confirmUpload(args) {
    return apiClient.post("/profile/photos/confirm-upload", {
      mediaId: args.mediaId,
      setAsMain: args.setAsMain,
    });
  },

  async addAdditional(args) {
    // After confirm, Nest treats additional via confirm with setAsMain false
    return this.confirmUpload({
      mediaId: String(args.mediaId ?? args.storageId ?? ""),
      setAsMain: false,
    });
  },

  async removeAdditional(id) {
    return apiClient.delete(`/profile/photos/${id}`);
  },

  async uploadFile(file, opts) {
    try {
      const prepared = await prepareImageForUpload(file);
      const signed = await this.requestUploadUrl({
        contentType: prepared.type || "image/jpeg",
        slot: opts?.slot ?? "additional",
        sizeBytes: prepared.size,
      });
      const uploadUrl = String(signed.uploadUrl);
      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": prepared.type || "image/jpeg" },
        body: prepared,
      });
      if (!res.ok) {
        track("upload_failure", { status: res.status });
        throw new Error("Upload failed. Please try a smaller JPG or PNG.");
      }
      const mediaId = signed.mediaId ? String(signed.mediaId) : undefined;
      if (mediaId) {
        await this.confirmUpload({
          mediaId,
          setAsMain: opts?.slot === "main",
        });
      }
      return { mediaId, ...signed };
    } catch (e) {
      track("upload_failure");
      throw e;
    }
  },
};
