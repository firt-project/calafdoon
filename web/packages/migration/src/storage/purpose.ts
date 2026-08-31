/**
 * Shared storage purpose / bucket mapping for Phase 3 file migration.
 * Buckets are private; access is via signed URLs only.
 */

export const MEDIA_PURPOSES = [
  "profile_main",
  "profile_additional",
  "profile_private",
  "chat_image",
  "evc_screenshot",
  "support_attachment",
  "unknown",
] as const;

export type MediaPurposeName = (typeof MEDIA_PURPOSES)[number];

/** Higher = more specific / restrictive when multiple refs exist. */
export const PURPOSE_PRIORITY: Record<MediaPurposeName, number> = {
  profile_private: 100,
  evc_screenshot: 90,
  support_attachment: 80,
  chat_image: 70,
  profile_main: 60,
  profile_additional: 50,
  unknown: 0,
};

export type BucketConfig = {
  profile: string;
  profilePrivate: string;
  chat: string;
  support: string;
  evc: string;
};

export function defaultBucketConfig(
  env: NodeJS.ProcessEnv = process.env
): BucketConfig {
  return {
    profile: env.S3_BUCKET_PROFILE ?? "hel-profile",
    profilePrivate: env.S3_BUCKET_PROFILE_PRIVATE ?? "hel-profile-private",
    chat: env.S3_BUCKET_CHAT ?? "hel-chat",
    support: env.S3_BUCKET_SUPPORT ?? "hel-support",
    evc: env.S3_BUCKET_EVC ?? "hel-evc",
  };
}

export function bucketForPurpose(
  purpose: MediaPurposeName,
  buckets: BucketConfig = defaultBucketConfig()
): string {
  switch (purpose) {
    case "profile_private":
      return buckets.profilePrivate;
    case "chat_image":
      return buckets.chat;
    case "support_attachment":
      return buckets.support;
    case "evc_screenshot":
      return buckets.evc;
    case "profile_main":
    case "profile_additional":
    case "unknown":
    default:
      return buckets.profile;
  }
}

export function pickPurpose(
  purposes: MediaPurposeName[]
): MediaPurposeName {
  if (purposes.length === 0) return "unknown";
  return purposes.reduce((best, p) =>
    PURPOSE_PRIORITY[p] > PURPOSE_PRIORITY[best] ? p : best
  );
}

export function extensionForContentType(contentType: string | null | undefined): string {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpeg";
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("pdf")) return "pdf";
  if (ct.includes("heic")) return "heic";
  return "bin";
}

/** Deterministic object key from Convex storage id + content type. */
export function objectKeyFor(
  convexStorageId: string,
  contentType?: string | null
): string {
  const ext = extensionForContentType(contentType);
  return `${convexStorageId}.${ext}`;
}
