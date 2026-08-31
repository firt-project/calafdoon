import { BadRequestException } from "@nestjs/common";

/**
 * Central upload limits for presigned PUT / server-side uploads (H3).
 *
 * Existing product caps (do not raise without product review):
 * - Profile + chat images: 2 MiB (matches `photo-rules` / client compress target)
 * - EVC payment screenshots: 8 MiB (existing EVC service limit)
 *
 * Signed upload TTL remains `S3_SIGNED_URL_TTL_SECONDS` (default 300s).
 */

export type UploadPurpose =
  | "profile_main"
  | "profile_additional"
  | "profile_private"
  | "chat_image"
  | "evc_screenshot";

/** Max object size per purpose (bytes). */
export const UPLOAD_MAX_BYTES: Record<UploadPurpose, number> = {
  profile_main: 2 * 1024 * 1024,
  profile_additional: 2 * 1024 * 1024,
  profile_private: 2 * 1024 * 1024,
  chat_image: 2 * 1024 * 1024,
  evc_screenshot: 8 * 1024 * 1024,
};

/** Canonical MIME allowlist after normalization (no octet-stream). */
export const UPLOAD_ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/** @deprecated Prefer UPLOAD_ALLOWED_CONTENT_TYPES; kept for call-site compatibility. */
export const ALLOWED_IMAGE_CONTENT_TYPES = new Set([
  ...UPLOAD_ALLOWED_CONTENT_TYPES,
  "image/jpg", // accepted input; normalized to image/jpeg
]);

/** Default profile/chat max — same as UPLOAD_MAX_BYTES.profile_main. */
export const MAX_UPLOAD_BYTES = UPLOAD_MAX_BYTES.profile_main;

export function normalizeUploadContentType(raw: string): string {
  const t = raw.toLowerCase().trim();
  if (t === "image/jpg") return "image/jpeg";
  return t;
}

export function maxBytesForPurpose(purpose: UploadPurpose): number {
  return UPLOAD_MAX_BYTES[purpose];
}

/**
 * Validate client upload intent before issuing a signed PUT or storing bytes.
 * `sizeBytes` is required so storage signatures can bind Content-Length and
 * finalize steps can compare against a declared size.
 */
export function assertUploadIntent(opts: {
  purpose: UploadPurpose;
  contentType: string;
  sizeBytes: number | null | undefined;
}): { contentType: string; sizeBytes: number; maxBytes: number } {
  const contentType = normalizeUploadContentType(opts.contentType ?? "");
  if (!UPLOAD_ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new BadRequestException(
      opts.purpose === "evc_screenshot"
        ? "Unsupported image type"
        : "Only JPG, PNG, or WebP images are allowed"
    );
  }

  const sizeBytes = opts.sizeBytes;
  if (sizeBytes === undefined || sizeBytes === null) {
    throw new BadRequestException("sizeBytes is required");
  }
  if (typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes)) {
    throw new BadRequestException("sizeBytes must be a positive integer");
  }
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    throw new BadRequestException("sizeBytes must be a positive integer");
  }

  const maxBytes = maxBytesForPurpose(opts.purpose);
  if (sizeBytes > maxBytes) {
    throw new BadRequestException(
      opts.purpose === "evc_screenshot"
        ? "File too large"
        : "Image is too large. Please choose a photo under 2MB after compression."
    );
  }

  return { contentType, sizeBytes, maxBytes };
}

/**
 * Validate a trusted HEAD (or known buffer) against purpose limits and the
 * signed intent. Rejects MIME / size mismatches before activation.
 */
export function assertStoredUpload(opts: {
  purpose: UploadPurpose;
  contentType: string | null | undefined;
  sizeBytes: number;
  /** Declared size from sign-upload; when set, actual must match exactly. */
  declaredSizeBytes?: number | null;
}): { contentType: string; sizeBytes: number } {
  const contentType = normalizeUploadContentType(opts.contentType ?? "");
  if (!UPLOAD_ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new BadRequestException(
      opts.purpose === "evc_screenshot"
        ? "Unsupported image type"
        : "Only JPG, PNG, or WebP images are allowed"
    );
  }

  const sizeBytes = opts.sizeBytes;
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new BadRequestException(
      opts.purpose === "evc_screenshot"
        ? "Upload not found in storage"
        : "Image upload did not finish. Please try again."
    );
  }

  const maxBytes = maxBytesForPurpose(opts.purpose);
  if (sizeBytes > maxBytes) {
    throw new BadRequestException(
      opts.purpose === "evc_screenshot"
        ? "File too large"
        : "Image is too large. Please choose a photo under 2MB after compression."
    );
  }

  if (
    opts.declaredSizeBytes != null &&
    Number.isFinite(opts.declaredSizeBytes) &&
    opts.declaredSizeBytes > 0 &&
    sizeBytes !== opts.declaredSizeBytes
  ) {
    throw new BadRequestException(
      "Uploaded file size does not match the signed upload"
    );
  }

  return { contentType, sizeBytes };
}
