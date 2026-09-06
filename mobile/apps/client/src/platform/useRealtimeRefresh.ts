import { useEffect, useRef } from "react";
import { App as CapApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import {
  connectRealtime,
  subscribeRealtime,
  type RealtimeEvent,
} from "@hel/api-client";

type Options = {
  /** Also refresh when the app returns to the foreground / tab regains focus. */
  onResume?: boolean;
  /** Collapse a burst of events into one refresh. */
  debounceMs?: number;
  /** Skip everything (e.g. while a screen is disabled). */
  enabled?: boolean;
};

/**
 * Runs `onRefresh` when any of `events` fires on the socket, and (by default)
 * when the app resumes. Debounced so a burst of socket traffic is one refetch.
 *
 * Screens use manual load() callbacks rather than React Query, so this is the
 * single place realtime is wired to "reload this screen's data".
 */
export function useRealtimeRefresh(
  events: RealtimeEvent[],
  onRefresh: () => void,
  options: Options = {}
): void {
  const { onResume = true, debounceMs = 400, enabled = true } = options;
  const cb = useRef(onRefresh);
  cb.current = onRefresh;
  const key = events.join("|");

  useEffect(() => {
    if (!enabled) return;
    connectRealtime();

    let timer: number | null = null;
    const fire = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => cb.current(), debounceMs);
    };

    const unsubs = key ? key.split("|").map((e) => subscribeRealtime(e, fire)) : [];

    let appHandle: { remove: () => void } | undefined;
    let onVis: (() => void) | undefined;
    if (onResume) {
      if (Capacitor.isNativePlatform()) {
        void CapApp.addListener("appStateChange", ({ isActive }) => {
          if (isActive) fire();
        }).then((h) => {
          appHandle = h;
        });
      }
      onVis = () => {
        if (document.visibilityState === "visible") fire();
      };
      document.addEventListener("visibilitychange", onVis);
    }

    return () => {
      if (timer) window.clearTimeout(timer);
      unsubs.forEach((u) => u());
      appHandle?.remove();
      if (onVis) document.removeEventListener("visibilitychange", onVis);
    };
  }, [key, debounceMs, onResume, enabled]);
}
