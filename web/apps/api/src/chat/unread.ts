/** Unread helpers — migrated rows key by Convex user id; new rows by Postgres UUID. */

export type UnreadMap = Record<string, number>;

export function asUnreadMap(value: unknown): UnreadMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: UnreadMap = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

export function readUnreadCount(
  unreadByUser: unknown,
  userId: string,
  convexUserId?: string | null
): number {
  const map = asUnreadMap(unreadByUser);
  if (Object.prototype.hasOwnProperty.call(map, userId)) {
    return Math.max(0, map[userId] ?? 0);
  }
  if (convexUserId && Object.prototype.hasOwnProperty.call(map, convexUserId)) {
    return Math.max(0, map[convexUserId] ?? 0);
  }
  return 0;
}

/** Increment recipient unread; normalize to Postgres user id key. */
export function bumpUnread(
  unreadByUser: unknown,
  recipientUserId: string,
  recipientConvexId: string | null | undefined,
  delta = 1
): UnreadMap {
  const map = asUnreadMap(unreadByUser);
  const current = readUnreadCount(map, recipientUserId, recipientConvexId);
  if (recipientConvexId) delete map[recipientConvexId];
  map[recipientUserId] = Math.max(0, current + delta);
  return map;
}

/** Zero viewer unread; normalize to Postgres user id key. */
export function zeroUnread(
  unreadByUser: unknown,
  userId: string,
  convexUserId?: string | null
): UnreadMap {
  const map = asUnreadMap(unreadByUser);
  if (convexUserId) delete map[convexUserId];
  map[userId] = 0;
  return map;
}
