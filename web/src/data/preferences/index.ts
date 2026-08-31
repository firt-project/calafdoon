import { apiPreferences } from "./api";
import type { PreferencesAdapter } from "./types";

export type { PreferencesAdapter } from "./types";
export { PREFERENCES_METHOD_NAMES } from "./types";
export { apiPreferences } from "./api";

export function getPreferencesAdapter(): PreferencesAdapter {
  return apiPreferences;
}

export const preferences = new Proxy({} as PreferencesAdapter, {
  get(_t, prop: string) {
    const adapter = getPreferencesAdapter();
    const value = adapter[prop as keyof PreferencesAdapter];
    return typeof value === "function" ? value.bind(adapter) : value;
  },
});
