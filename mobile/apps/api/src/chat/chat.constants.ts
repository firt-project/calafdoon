export const MAX_MESSAGE_LENGTH = 2000;
export const DEFAULT_MESSAGE_PAGE = 50;
export const MAX_MESSAGE_PAGE = 100;
export const DEFAULT_NOTIFICATION_PAGE = 50;
export const MAX_NOTIFICATION_PAGE = 100;
export const TYPING_TTL_SECONDS = 4;
export const IMAGE_MESSAGE_PLACEHOLDER = "📷 Image";

/** Strip HTML/script tags; Convex stored plain text — keep payloads safe. */
export function sanitizeMessageBody(raw: string): string {
  return raw
    .replace(/<\/?[^>]+(>|$)/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim();
}

export function encodeMessageCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, "utf8").toString(
    "base64url"
  );
}

export function decodeMessageCursor(
  cursor: string
): { createdAt: Date; id: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const idx = raw.indexOf("|");
    if (idx <= 0) return null;
    const createdAt = new Date(raw.slice(0, idx));
    const id = raw.slice(idx + 1);
    if (Number.isNaN(createdAt.getTime()) || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

export function encodeNotificationCursor(createdAt: Date, id: string): string {
  return encodeMessageCursor(createdAt, id);
}

export function decodeNotificationCursor(cursor: string) {
  return decodeMessageCursor(cursor);
}
