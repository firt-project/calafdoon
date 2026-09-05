import * as SecureStore from "expo-secure-store";
import {
  configureAuthTokenStore,
  hydrateAuthTokensFromStore,
  type AuthTokenStore,
} from "@hel/api-client";

// SecureStore keys must be alphanumeric/./-/_ only.
const SESSION_KEY = "hel_session_token";
const CSRF_KEY = "hel_csrf_token";

const secureStoreTokenStore: AuthTokenStore = {
  async getSessionToken() {
    return (await SecureStore.getItemAsync(SESSION_KEY)) ?? undefined;
  },
  async setSessionToken(token) {
    if (token) await SecureStore.setItemAsync(SESSION_KEY, token);
    else await SecureStore.deleteItemAsync(SESSION_KEY);
  },
  async getCsrfToken() {
    return (await SecureStore.getItemAsync(CSRF_KEY)) ?? undefined;
  },
  async setCsrfToken(token) {
    if (token) await SecureStore.setItemAsync(CSRF_KEY, token);
    else await SecureStore.deleteItemAsync(CSRF_KEY);
  },
};

/** Wires @hel/api-client's session/CSRF persistence to the device Keychain/Keystore. */
export async function initAuthTokenStore(): Promise<void> {
  configureAuthTokenStore(secureStoreTokenStore);
  await hydrateAuthTokensFromStore();
}
