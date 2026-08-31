import { apiAdmin } from "./api";
import type { AdminAdapter } from "./types";

export type { AdminAdapter } from "./types";
export { ADMIN_TOP_METHOD_NAMES } from "./types";

export function getAdminAdapter(): AdminAdapter {
  return apiAdmin;
}

export const admin = new Proxy({} as AdminAdapter, {
  get(_t, prop: string) {
    const adapter = getAdminAdapter();
    const value = adapter[prop as keyof AdminAdapter];
    if (typeof value === "function") return value.bind(adapter);
    return value;
  },
});
