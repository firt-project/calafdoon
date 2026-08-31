"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  connectRealtime,
  getRealtimeSocket,
  subscribeRealtime,
} from "@/data/realtime/socket-client";

type PresenceMap = Record<string, boolean>;

type PresenceContextValue = {
  isOnline: (userId: string | undefined | null, fallback?: boolean) => boolean;
  seed: (entries: Array<{ userId: string; isOnline?: boolean }>) => void;
};

const PresenceContext = createContext<PresenceContextValue | null>(null);

const HEARTBEAT_MS = 30_000;

export function PresenceProvider({ children }: { children: ReactNode }) {
  const [map, setMap] = useState<PresenceMap>({});

  const seed = useCallback(
    (entries: Array<{ userId: string; isOnline?: boolean }>) => {
      if (entries.length === 0) return;
      setMap((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const e of entries) {
          if (!e.userId || e.isOnline === undefined) continue;
          if (next[e.userId] !== e.isOnline) {
            next[e.userId] = e.isOnline;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    },
    []
  );

  const isOnline = useCallback(
    (userId: string | undefined | null, fallback = false) => {
      if (!userId) return fallback;
      if (userId in map) return map[userId];
      return fallback;
    },
    [map]
  );

  useEffect(() => {
    connectRealtime();

    const unsub = subscribeRealtime("presence:update", (payload) => {
      const p = payload as { userId?: string; isOnline?: boolean };
      if (!p?.userId || typeof p.isOnline !== "boolean") return;
      const userId = p.userId;
      const online = p.isOnline;
      setMap((prev) => {
        if (prev[userId] === online) return prev;
        return { ...prev, [userId]: online };
      });
    });

    const ping = () => {
      getRealtimeSocket()?.emit("presence:ping");
    };
    ping();
    const timer = window.setInterval(ping, HEARTBEAT_MS);

    return () => {
      unsub();
      window.clearInterval(timer);
    };
  }, []);

  return (
    <PresenceContext.Provider value={{ isOnline, seed }}>
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresence(): PresenceContextValue {
  const ctx = useContext(PresenceContext);
  if (!ctx) {
    return {
      isOnline: (_id, fallback = false) => fallback,
      seed: () => {},
    };
  }
  return ctx;
}
