/** Product limits for the single profile video per member. */
export const MAX_VIDEO_SECONDS = 30;
/**
 * Bunny reports `length` as whole seconds, so a 30.4 s clip may read 30 or 31.
 * Clients enforce the exact 30 s; the server allows this much rounding.
 */
export const SERVER_DURATION_TOLERANCE_SECONDS = 1;
/** Upload size accepted at authorization time (a 30 s phone clip is far smaller). */
export const MAX_UPLOAD_BYTES = 150 * 1024 * 1024;
/** Total Bunny storage (all renditions) above which a processed video is rejected. */
export const MAX_STORED_BYTES = 400 * 1024 * 1024;
export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime"] as const;

export const TUS_ENDPOINT = "https://video.bunnycdn.com/tusupload";
/** How long upload credentials stay valid (Bunny recommends >= 1 h). */
export const UPLOAD_AUTH_TTL_SECONDS = 2 * 60 * 60;
/** Embed token lifetime. */
export const PLAYBACK_TTL_SECONDS = 60 * 60;
/** Minimum gap between Bunny status refreshes for one video. */
export const STATUS_REFRESH_MIN_MS = 4_000;
/** A video still processing after this long is treated as failed. */
export const PROCESSING_TIMEOUT_MS = 3 * 60 * 60 * 1000;
