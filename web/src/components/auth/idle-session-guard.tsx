"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useUnifiedAuth } from "@/data/auth/hooks";

/** Must match Nest idle session timeout. */
export const IDLE_LOGOUT_MS = 3 * 60 * 60 * 1000;

const WINDOW_ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
];

/**
 * Signs the user out after 3 hours with no interaction on this device.
 */
export function IdleSessionGuard() {
  const { isAuthenticated, isLoading, signOut } = useUnifiedAuth();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signingOutRef = useRef(false);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;

    const clearTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const logout = () => {
      if (signingOutRef.current) return;
      signingOutRef.current = true;
      clearTimer();
      void signOut()
        .then(() => {
          toast.message("Signed out after 3 hours of inactivity.");
        })
        .finally(() => {
          signingOutRef.current = false;
        });
    };

    const resetTimer = () => {
      if (document.visibilityState === "hidden") return;
      clearTimer();
      timerRef.current = setTimeout(logout, IDLE_LOGOUT_MS);
    };

    resetTimer();

    for (const event of WINDOW_ACTIVITY_EVENTS) {
      window.addEventListener(event, resetTimer, { passive: true });
    }
    document.addEventListener("visibilitychange", resetTimer);

    return () => {
      clearTimer();
      for (const event of WINDOW_ACTIVITY_EVENTS) {
        window.removeEventListener(event, resetTimer);
      }
      document.removeEventListener("visibilitychange", resetTimer);
    };
  }, [isAuthenticated, isLoading, signOut]);

  return null;
}
