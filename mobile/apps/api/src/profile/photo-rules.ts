/** Port of convex/lib/premium.ts photo limits + matchPresentation photo visibility. */

export const MAX_PROFILE_PHOTOS = 5;
export const MAX_ADDITIONAL_PHOTOS = MAX_PROFILE_PHOTOS - 1;
/** Private “reveal once” gallery — separate from public profile photos. */
export const MAX_PRIVATE_PHOTOS = 2;
/** Basic members get 1 reveal per active match; premium gets 2. */
export const PRIVATE_REVEALS_PER_MATCH_BASIC = 1;
export const PRIVATE_REVEALS_PER_MATCH_PREMIUM = 2;
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export const ALLOWED_IMAGE_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export type PhotoVisibility = "everyone" | "matches" | "private";

export function resolvePhotoVisibility(profile: {
  photoVisibility?: PhotoVisibility | string | null;
}): PhotoVisibility {
  const v = profile.photoVisibility;
  if (v === "matches" || v === "private" || v === "everyone") return v;
  return "everyone";
}

/**
 * Port of canViewerSeePhotos (without Convex match lookup — caller supplies hasActiveMatch).
 */
export function canViewerSeePhotos(opts: {
  viewerUserId: string | null;
  profileOwnerUserId: string;
  photoVisibility?: PhotoVisibility | string | null;
  isStaff?: boolean;
  hasActiveMatch?: boolean;
}): boolean {
  if (opts.viewerUserId && opts.viewerUserId === opts.profileOwnerUserId) {
    return true;
  }
  if (opts.isStaff) return true;

  const visibility = resolvePhotoVisibility({
    photoVisibility: opts.photoVisibility,
  });
  if (visibility === "everyone") return true;
  if (visibility === "private") return false;
  // matches-only
  if (!opts.viewerUserId) return false;
  return !!opts.hasActiveMatch;
}
