export type NotificationsAdapter = {
  list(opts?: { cursor?: string; limit?: number }): Promise<unknown>;
  unreadCount(): Promise<number | { count: number }>;
  markAsRead(id: string): Promise<unknown>;
  markAllAsRead(): Promise<unknown>;
  markNotificationsRead(ids: string[]): Promise<unknown>;
  getMemberReminders(): Promise<unknown>;
};

export const NOTIFICATIONS_METHOD_NAMES = [
  "list",
  "unreadCount",
  "markAsRead",
  "markAllAsRead",
  "markNotificationsRead",
  "getMemberReminders",
] as const;
