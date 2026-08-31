import { apiAuth } from "./api";
import type { AuthAdapter } from "./types";

export type { AuthAdapter, LoginResult } from "./types";
export { AUTH_METHOD_NAMES } from "./types";

export function getAuthAdapter(): AuthAdapter {
  return apiAuth;
}

export const auth = new Proxy({} as AuthAdapter, {
  get(_t, prop: string) {
    const adapter = getAuthAdapter();
    const value = adapter[prop as keyof AuthAdapter];
    return typeof value === "function" ? value.bind(adapter) : value;
  },
});
