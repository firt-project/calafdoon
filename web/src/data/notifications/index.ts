import { apiNotifications } from "./api";
import type { NotificationsAdapter } from "./types";

export type { NotificationsAdapter } from "./types";
export { NOTIFICATIONS_METHOD_NAMES } from "./types";

export function getNotificationsAdapter(): NotificationsAdapter {
  return apiNotifications;
}

export const notifications = new Proxy({} as NotificationsAdapter, {
  get(_t, prop: string) {
    const adapter = getNotificationsAdapter();
    const value = adapter[prop as keyof NotificationsAdapter];
    return typeof value === "function" ? value.bind(adapter) : value;
  },
});
