import { apiProfile } from "./api";
import type { ProfileAdapter } from "./types";

export type { ProfileAdapter } from "./types";
export { PROFILE_METHOD_NAMES } from "./types";

export function getProfileAdapter(): ProfileAdapter {
  return apiProfile;
}

export const profile = new Proxy({} as ProfileAdapter, {
  get(_t, prop: string) {
    const adapter = getProfileAdapter();
    const value = adapter[prop as keyof ProfileAdapter];
    return typeof value === "function" ? value.bind(adapter) : value;
  },
});
