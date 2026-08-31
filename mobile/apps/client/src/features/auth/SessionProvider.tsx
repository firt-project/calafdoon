import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  auth,
  configureAuthTokenStore,
  connectRealtime,
  disconnectRealtime,
  hydrateAuthTokensFromStore,
  type AccessStateLike,
  type LoginResult,
  type SessionUser,
} from "@hel/api-client";
import { ApiClientError } from "@hel/api-client";
import {
  clearAllClientData,
  createSecureAuthTokenStore,
} from "@/platform/secure-storage";
import { readClientEnv } from "@/platform/env";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { registerAndroidBackHandler } from "@/navigation/android-back";
import { securityGateRouteForUser } from "@/lib/security-gate-codes";

type SessionContextValue = {
  ready: boolean;
  user: SessionUser | null;
  accessState: AccessStateLike | null;
  offline: boolean;
  /** True when first API bootstrap timed out or failed (guest can still open Welcome). */
  bootSlow: boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<LoginResult>;
  verifyMfaLogin: (mfaToken: string, code: string) => Promise<LoginResult>;
  register: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  error: string | null;
  clearError: () => void;
};

/** Native splash must hide even if CapacitorHttp ignores AbortSignal. */
const BOOT_READY_MS = 12_000;
const BOOT_FORCE_SPLASH_HIDE_MS = 16_000;
const HYDRATE_TIMEOUT_MS = 3_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function hideNativeSplash(): Promise<void> {
  try {
    await SplashScreen.hide();
  } catch {
    /* web / already hidden */
  }
}

const SessionContext = createContext<SessionContextValue | null>(null);

function homeRouteFromAccess(access: AccessStateLike | null): string {
  // Nest accessState uses `nextRoute` (legacy clients may send `homeRoute`).
  const route =
    access && typeof access === "object"
      ? String(
          (access as { nextRoute?: string; homeRoute?: string }).nextRoute ??
            (access as { homeRoute?: string }).homeRoute ??
            ""
        )
      : "";
  if (route.includes("login")) return "/welcome";
  if (route.includes("register")) return "/onboarding/gender";
  if (route.includes("questionnaire")) return "/onboarding/questionnaire";
  if (route.includes("payment")) return "/plans";
  if (route.includes("admin")) return "/admin";
  if (route.includes("dashboard") || route === "/home") return "/home";

  const role = String(access?.role ?? "").toLowerCase();
  if (role === "admin" || role === "owner") return "/admin";

  if (access) {
    if (access.questionnaireComplete === false) {
      return "/onboarding/questionnaire";
    }
    // Prefer server hasPaidAccess (respects Waafi/EVC paidUntil expiry).
    if (access.hasPaidAccess === true) {
      // continue to home below
    } else if (access.hasPaidAccess === false) {
      return "/plans";
    } else {
      const granted =
        access.hasPaid === true ||
        access.approved === true ||
        String(access.reviewStatus ?? "") === "approved";
      if (!granted) return "/plans";
    }
  }

  // API may still send legacy `/dashboard` — member home is `/home`
  // Without accessState, do not assume paid home (avoids empty Home after login).
  if (!access) return "/welcome";
  return "/home";
}

/** Security gates (M3/M4/L4) first, then paid / onboarding / admin home. */
export function securityHomeRoute(
  user: SessionUser | null,
  access: AccessStateLike | null
): string {
  return securityGateRouteForUser(user) ?? homeRouteFromAccess(access);
}

export function isStaffUser(
  user: SessionUser | null,
  access: AccessStateLike | null
): boolean {
  const role = String(
    access?.role ??
      user?.role ??
      (user?.profile && typeof user.profile === "object"
        ? (user.profile as { role?: string }).role
        : "") ??
      ""
  ).toLowerCase();
  return role === "admin" || role === "owner";
}

export function staffRoleLabel(
  user: SessionUser | null,
  access: AccessStateLike | null
): "Owner" | "Admin" | null {
  const role = String(
    access?.role ??
      user?.role ??
      (user?.profile && typeof user.profile === "object"
        ? (user.profile as { role?: string }).role
        : "") ??
      ""
  ).toLowerCase();
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [accessState, setAccessState] = useState<AccessStateLike | null>(null);
  const [offline, setOffline] = useState(false);
  const [bootSlow, setBootSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const boot = await auth.bootstrapMe();
      setUser(boot.user);
      setAccessState(boot.accessState);
      setOffline(false);
      setBootSlow(false);
      if (boot.user) {
        const { rememberLastUserId } = await import("@/platform/secure-storage");
        await rememberLastUserId(boot.user.id);
        connectRealtime();
      } else disconnectRealtime();
    } catch (e) {
      // Keep the current session on blips (common right after payment).
      if (e instanceof ApiClientError && e.status === 0) setOffline(true);
      else setOffline(true);
      setBootSlow(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let forceHideTimer: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      forceHideTimer = setTimeout(() => {
        void hideNativeSplash();
        if (!cancelled) {
          setBootSlow(true);
          setReady(true);
        }
      }, BOOT_FORCE_SPLASH_HIDE_MS);

      try {
        readClientEnv();
        configureAuthTokenStore(createSecureAuthTokenStore());
        await Promise.race([
          hydrateAuthTokensFromStore(),
          sleep(HYDRATE_TIMEOUT_MS),
        ]);
        if (Capacitor.isNativePlatform()) {
          try {
            await StatusBar.setStyle({ style: Style.Light });
            await StatusBar.setBackgroundColor({ color: "#a61b2b" });
          } catch {
            /* web */
          }
        }

        // Start session bootstrap but do not block UI past BOOT_READY_MS.
        const bootPromise = refresh().catch(() => {
          setOffline(true);
          setBootSlow(true);
        });
        const raced = await Promise.race([
          bootPromise.then(() => "ok" as const),
          sleep(BOOT_READY_MS).then(() => "timeout" as const),
        ]);
        if (raced === "timeout" && !cancelled) {
          setBootSlow(true);
          setOffline(true);
        }
        // Let a late bootstrap still populate the session.
        void bootPromise.finally(() => {
          if (!cancelled) setBootSlow(false);
        });

        if (!cancelled) setReady(true);
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "App configuration error. Contact support."
        );
        if (!cancelled) setReady(true);
      } finally {
        if (forceHideTimer) clearTimeout(forceHideTimer);
        await hideNativeSplash();
      }
    })();

    const onNet = () => setOffline(!navigator.onLine);
    window.addEventListener("online", onNet);
    window.addEventListener("offline", onNet);

    let removeBack: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      removeBack = registerAndroidBackHandler();
      CapApp.addListener("appStateChange", ({ isActive }) => {
        if (isActive) void refresh();
      });
    }

    return () => {
      cancelled = true;
      if (forceHideTimer) clearTimeout(forceHideTimer);
      window.removeEventListener("online", onNet);
      window.removeEventListener("offline", onNet);
      removeBack?.();
    };
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      setError(null);
      try {
        const result = await auth.login(email, password);
        if ("mfaRequired" in result && result.mfaRequired) {
          return result;
        }
        await refresh();
        return result;
      } catch (e) {
        setError(
          e instanceof ApiClientError
            ? e.message
            : "Could not sign in. Check your connection and try again."
        );
        throw e;
      }
    },
    [refresh]
  );

  const verifyMfaLogin = useCallback(
    async (mfaToken: string, code: string) => {
      setError(null);
      try {
        const result = await auth.verifyMfaLogin(mfaToken, code);
        if ("mfaRequired" in result && result.mfaRequired) {
          return result;
        }
        await refresh();
        return result;
      } catch (e) {
        setError(
          e instanceof ApiClientError
            ? e.message
            : "Invalid authenticator code. Try again."
        );
        throw e;
      }
    },
    [refresh]
  );

  const register = useCallback(
    async (email: string, password: string) => {
      setError(null);
      try {
        const result = await auth.register(email, password);
        await refresh();
        return result;
      } catch (e) {
        setError(
          e instanceof ApiClientError
            ? e.message
            : "Could not create account. Try again."
        );
        throw e;
      }
    },
    [refresh]
  );

  const logout = useCallback(async () => {
    setError(null);
    try {
      await auth.logout();
    } finally {
      await clearAllClientData();
      setUser(null);
      setAccessState(null);
      disconnectRealtime();
    }
  }, []);

  const deleteAccount = useCallback(
    async (password: string) => {
      setError(null);
      await auth.deleteAccount(password);
      await clearAllClientData();
      setUser(null);
      setAccessState(null);
    },
    []
  );

  const value = useMemo(
    () => ({
      ready,
      user,
      accessState,
      offline,
      bootSlow,
      refresh,
      login,
      verifyMfaLogin,
      register,
      logout,
      deleteAccount,
      error,
      clearError: () => setError(null),
    }),
    [
      ready,
      user,
      accessState,
      offline,
      bootSlow,
      refresh,
      login,
      verifyMfaLogin,
      register,
      logout,
      deleteAccount,
      error,
    ]
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession requires SessionProvider");
  return ctx;
}

export { homeRouteFromAccess };
