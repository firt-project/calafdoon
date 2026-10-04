import { apiClient } from "../api-client";
import { prepareImageForUpload } from "../lib/prepare-image";
import { track } from "../telemetry";
import type { PhotosAdapter } from "./types";

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  Plugins?: {
    CapacitorHttp?: {
      request: (o: {
        url: string;
        method: string;
        headers: Record<string, string>;
        data: string;
        dataType: "file";
      }) => Promise<{ status: number }>;
    };
  };
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error ?? new Error("Could not read image"));
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.readAsDataURL(blob);
  });
}

/**
 * Presigned PUT. Inside Capacitor, the patched fetch decodes Blob bodies as UTF-8
 * text (corrupting the JPEG and breaking the signed Content-Length), so send the
 * bytes through the native HTTP plugin as a base64 "file" instead.
 */
async function putToStorage(url: string, body: Blob, contentType: string): Promise<boolean> {
  const cap = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
  const http = cap?.isNativePlatform?.() ? cap.Plugins?.CapacitorHttp : undefined;
  if (http) {
    const res = await http.request({
      url,
      method: "PUT",
      headers: { "Content-Type": contentType },
      data: await blobToBase64(body),
      dataType: "file",
    });
    return res.status >= 200 && res.status < 300;
  }
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body,
  });
  return res.ok;
}

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

  async reorder(args) {
    return apiClient.patch("/profile/photos/order", {
      orderedMediaIds: args.orderedMediaIds,
    });
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
      const ok = await putToStorage(uploadUrl, prepared, prepared.type || "image/jpeg");
      if (!ok) {
        track("upload_failure");
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
