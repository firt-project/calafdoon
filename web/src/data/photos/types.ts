export type PhotosAdapter = {
  listMine(): Promise<unknown>;
  requestUploadUrl(args: {
    contentType: string;
    slot?: "main" | "additional" | "private";
    sizeBytes?: number;
  }): Promise<{ uploadUrl: string; mediaId?: string; [key: string]: unknown }>;
  confirmUpload(args: {
    mediaId?: string;
    storageId?: string;
    setAsMain?: boolean;
  }): Promise<unknown>;
  addAdditional(args: Record<string, unknown>): Promise<unknown>;
  removeAdditional(id: string): Promise<unknown>;
  /** EXIF-stripped upload via signed URL (api) or Convex generateUploadUrl. */
  uploadFile(file: File, opts?: { slot?: "main" | "additional" | "private" }): Promise<unknown>;
};

export const PHOTOS_METHOD_NAMES = [
  "listMine",
  "requestUploadUrl",
  "confirmUpload",
  "addAdditional",
  "removeAdditional",
  "uploadFile",
] as const;
