/** Thin wrapper so UI code does not call localStorage directly for prefs. */
const memory = new Map<string, string>();

function backend(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export const prefsService = {
  get(key: string): string | null {
    const ls = backend();
    if (!ls) return memory.get(key) ?? null;
    return ls.getItem(key);
  },
  set(key: string, value: string): void {
    memory.set(key, value);
    const ls = backend();
    if (ls) ls.setItem(key, value);
  },
  remove(key: string): void {
    memory.delete(key);
    const ls = backend();
    if (ls) ls.removeItem(key);
  },
};
