import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { App as CapApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import {
  authenticateBiometric,
  disableBiometricLock,
  isBiometricLockEnabled,
} from "@/platform/biometrics";
import { useSession } from "@/features/auth/SessionProvider";

type Props = { children: ReactNode };

/** Ignore brief inactive blips from the OS biometric sheet itself. */
const BACKGROUND_LOCK_MS = 2500;

/**
 * Application convenience lock — does not replace server auth.
 * If the session is missing/expired, biometric success still routes to login.
 *
 * Re-locks only after a real background (cold start / leave app), not on every
 * session refresh or while the fingerprint dialog is open.
 */
export function BiometricGate({ children }: Props) {
  const { ready, user, logout } = useSession();
  const userId = user?.id ?? null;
  const [locked, setLocked] = useState(false);
  // Guests must not wait on biometric prefs — that looked like a blank hang.
  const [checking, setChecking] = useState(() => Boolean(userId));
  const [message, setMessage] = useState<string | null>(null);
  const [authTick, setAuthTick] = useState(0);

  const unlockedRef = useRef(false);
  const authenticatingRef = useRef(false);
  const backgroundedAtRef = useRef<number | null>(null);

  const requestUnlock = useCallback(async () => {
    if (authenticatingRef.current) return;
    authenticatingRef.current = true;
    setMessage(null);
    try {
      const result = await authenticateBiometric(
        "Unlock HelCalaf on this device"
      );
      if (result.ok) {
        unlockedRef.current = true;
        setLocked(false);
        setMessage(null);
      } else {
        setMessage(
          result.cancelled
            ? "Unlock cancelled. You can try again or sign in with your password."
            : result.message
        );
      }
    } finally {
      authenticatingRef.current = false;
    }
  }, []);

  // Initial gate + clear lock when signed out. Do not re-lock on session refresh.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!ready) return;
      if (!userId) {
        unlockedRef.current = false;
        backgroundedAtRef.current = null;
        setLocked(false);
        setChecking(false);
        void disableBiometricLock();
        return;
      }
      setChecking(true);
      const enabled = await Promise.race([
        isBiometricLockEnabled(),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2500)),
      ]);
      if (cancelled) return;
      if (enabled && !unlockedRef.current) {
        setLocked(true);
      } else {
        setLocked(false);
      }
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, userId]);

  // Re-lock only after returning from a real background period.
  useEffect(() => {
    if (!ready || !userId) return;

    const onBecameActive = async () => {
      // Fingerprint UI briefly backgrounds the app — ignore that, and ignore
      // resumes with no recorded background (avoids lock loops after unlock).
      if (authenticatingRef.current) return;
      if (!unlockedRef.current) return;

      const bgAt = backgroundedAtRef.current;
      if (bgAt == null) return;
      backgroundedAtRef.current = null;
      if (Date.now() - bgAt < BACKGROUND_LOCK_MS) return;

      const enabled = await isBiometricLockEnabled();
      if (!enabled) return;

      unlockedRef.current = false;
      setLocked(true);
      setMessage(null);
    };

    if (Capacitor.isNativePlatform()) {
      let removed = false;
      let handle: { remove: () => Promise<void> } | undefined;
      void CapApp.addListener("appStateChange", ({ isActive }) => {
        if (!isActive) {
          if (!authenticatingRef.current) {
            backgroundedAtRef.current = Date.now();
          }
          return;
        }
        void onBecameActive();
      }).then((h) => {
        if (removed) void h.remove();
        else handle = h;
      });
      return () => {
        removed = true;
        void handle?.remove();
      };
    }

    const onVis = () => {
      if (document.visibilityState === "hidden") {
        if (!authenticatingRef.current) {
          backgroundedAtRef.current = Date.now();
        }
        return;
      }
      void onBecameActive();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [ready, userId]);

  // Prompt once when locked (and on Try again via authTick).
  useEffect(() => {
    if (!locked || checking || !userId) return;
    void requestUnlock();
  }, [locked, checking, userId, authTick, requestUnlock]);

  if (!ready || checking) {
    return (
      <div className="splash" aria-busy="true">
        <p className="muted">Preparing…</p>
      </div>
    );
  }

  if (locked && user) {
    return (
      <div className="screen biometric-lock" role="dialog" aria-label="App lock">
        <h1>HelCalaf</h1>
        <p className="muted">
          Biometric unlock is enabled for this device. Your account session is still verified
          by the server.
        </p>
        {message && (
          <div className="form-error" role="alert">
            {message}
          </div>
        )}
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => {
            setMessage(null);
            setAuthTick((n) => n + 1);
          }}
        >
          Try again
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-block"
          onClick={() => void logout()}
        >
          Sign in with password
        </button>
      </div>
    );
  }

  return children;
}
