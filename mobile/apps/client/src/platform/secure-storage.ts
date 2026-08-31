import { Capacitor } from "@capacitor/core";
import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import { Preferences } from "@capacitor/preferences";
import type { AuthTokenStore } from "@hel/api-client";

const SESSION_KEY = "hel_session_token";
const CSRF_KEY = "hel_csrf_token";
const LAST_USER_KEY = "hel_last_user_id";
const BIOMETRIC_KEY = "hel_biometric_lock_enabled";
const DRAFT_PREFIX = "hel_chat_draft_v1";

async function secureSet(key: string, value: string | null): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    if (value == null) {
      try {
        await SecureStorage.remove(key);
      } catch {
        /* ignore missing */
      }
      return;
    }
    await SecureStorage.set(key, value);
    return;
  }
  if (typeof sessionStorage === "undefined") return;
  if (value == null) sessionStorage.removeItem(key);
  else sessionStorage.setItem(key, value);
}

async function secureGet(key: string): Promise<string | undefined> {
  if (Capacitor.isNativePlatform()) {
    try {
      const value = await SecureStorage.get(key);
      return typeof value === "string" && value ? value : undefined;
    } catch {
      return undefined;
    }
  }
  if (typeof sessionStorage === "undefined") return undefined;
  return sessionStorage.getItem(key) ?? undefined;
}

/** Non-sensitive prefs (locale, theme) — not for auth tokens. */
export const prefsStore = {
  async get(key: string): Promise<string | null> {
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key });
      return value;
    }
    return localStorage.getItem(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await Preferences.set({ key, value });
      return;
    }
    localStorage.setItem(key, value);
  },
  async remove(key: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await Preferences.remove({ key });
      return;
    }
    localStorage.removeItem(key);
  },
};

export function createSecureAuthTokenStore(): AuthTokenStore {
  return {
    getSessionToken: () => secureGet(SESSION_KEY),
    setSessionToken: (token) => secureSet(SESSION_KEY, token ?? null),
    getCsrfToken: () => secureGet(CSRF_KEY),
    setCsrfToken: (token) => secureSet(CSRF_KEY, token ?? null),
  };
}

export async function rememberLastUserId(userId: string | null): Promise<void> {
  if (userId) await prefsStore.set(LAST_USER_KEY, userId);
  else await prefsStore.remove(LAST_USER_KEY);
}

export async function clearAllClientData(): Promise<void> {
  const lastUser = await prefsStore.get(LAST_USER_KEY);
  await secureSet(SESSION_KEY, null);
  await secureSet(CSRF_KEY, null);
  await prefsStore.remove(BIOMETRIC_KEY);
  if (lastUser) {
    const indexKey = `${DRAFT_PREFIX}:index:${lastUser}`;
    const raw = await prefsStore.get(indexKey);
    if (raw) {
      try {
        const ids = JSON.parse(raw) as string[];
        if (Array.isArray(ids)) {
          await Promise.all(
            ids.map((id) =>
              prefsStore.remove(`${DRAFT_PREFIX}:${lastUser}:${id}`)
            )
          );
        }
      } catch {
        /* ignore */
      }
    }
    await prefsStore.remove(indexKey);
  }
  await prefsStore.remove(LAST_USER_KEY);
}
