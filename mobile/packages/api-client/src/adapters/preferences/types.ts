export type PreferencesAdapter = {
  getPreferences(): Promise<unknown>;
  updatePreferences(patch: Record<string, unknown>): Promise<unknown>;
};

export const PREFERENCES_METHOD_NAMES = [
  "getPreferences",
  "updatePreferences",
] as const;
