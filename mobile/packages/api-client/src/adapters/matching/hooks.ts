"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiMatching } from "./api";

function useApiMatches(
  filters: Record<string, unknown> | undefined,
  enabled: boolean
) {
  const [apiData, setApiData] = useState<unknown>(undefined);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const filterKey = JSON.stringify(filters ?? {});

  useEffect(() => {
    if (!enabled) {
      abortRef.current?.abort();
      setApiData(undefined);
      setIsRefreshing(false);
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setIsRefreshing(true);
    void apiMatching
      .getMatches(filters, ac.signal)
      .then((d) => {
        if (!ac.signal.aborted) setApiData(d);
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (err instanceof Error && err.name === "AbortError") return;
        setApiData(null);
      })
      .finally(() => {
        if (!ac.signal.aborted) setIsRefreshing(false);
      });
    return () => {
      ac.abort();
    };
  }, [filterKey, enabled]);

  const removeUser = useCallback((userId: string) => {
    setApiData((prev: unknown) => {
      const list = Array.isArray(prev)
        ? prev
        : prev &&
            typeof prev === "object" &&
            "items" in prev &&
            Array.isArray((prev as { items: unknown[] }).items)
          ? (prev as { items: unknown[] }).items
          : null;
      if (!list) return prev;
      const nextItems = list.filter((row) => {
        const item = row as { userId?: string };
        return item.userId !== userId;
      });
      if (Array.isArray(prev)) return nextItems;
      return { ...(prev as object), items: nextItems };
    });
  }, []);

  return { matches: apiData, isRefreshing, removeUser };
}

export function useMatches(
  filters?: Record<string, unknown>,
  enabled = true
) {
  return useApiMatches(enabled ? filters : undefined, enabled);
}

export function useMatchLists(
  filters?: Record<string, unknown>,
  enabled = true
) {
  return useApiMatchLists(enabled ? filters : undefined, enabled);
}

function useApiMatchLists(
  filters: Record<string, unknown> | undefined,
  enabled: boolean
) {
  const [apiData, setApiData] = useState<unknown>(undefined);
  useEffect(() => {
    if (!enabled) {
      setApiData(undefined);
      return;
    }
    let cancelled = false;
    void apiMatching
      .getMatchLists(filters)
      .then((d) => {
        if (!cancelled) setApiData(d);
      })
      .catch(() => {
        if (!cancelled) setApiData(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters ?? {}), enabled]);
  return apiData;
}

export function useMyMatches(enabled = true) {
  return useApiMyMatches(enabled);
}

function useApiMyMatches(enabled: boolean) {
  const [apiData, setApiData] = useState<unknown>(undefined);
  useEffect(() => {
    if (!enabled) {
      setApiData(undefined);
      return;
    }
    let cancelled = false;
    void apiMatching
      .getMyMatches()
      .then((d) => {
        if (!cancelled) setApiData(d);
      })
      .catch(() => {
        if (!cancelled) setApiData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return apiData;
}

export function useHomeFeed(enabled = true) {
  const [data, setData] = useState<unknown>(undefined);
  useEffect(() => {
    if (!enabled) {
      setData(undefined);
      return;
    }
    let cancelled = false;
    void apiMatching
      .getHomeFeed()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return data;
}

export function useLikeUser() {
  return useCallback(
    async (args: {
      userId?: string;
      toUserId?: string;
      action?: "like" | "pass" | "shortlist";
    }) => {
      const userId = args.userId ?? args.toUserId;
      if (!userId) throw new Error("userId required");
      return apiMatching.likeUser(
        userId,
        args.action === "pass"
          ? "pass"
          : args.action === "shortlist"
            ? "shortlist"
            : "like"
      );
    },
    []
  );
}

export function useMarkMatchSeen() {
  return useCallback(async (args: { matchId: string } | string) => {
    const matchId = typeof args === "string" ? args : args.matchId;
    return apiMatching.markMatchSeen(matchId);
  }, []);
}

export function useArchiveMatch() {
  return useCallback(
    async (args: { matchId: string; archived?: boolean }) =>
      apiMatching.archiveMatch(args.matchId, args.archived ?? true),
    []
  );
}

export function useCompatibilityBreakdown(
  targetUserId: string | undefined,
  enabled = true
) {
  return useApiBreakdown(enabled ? targetUserId : undefined);
}

function useApiBreakdown(userId: string | undefined) {
  const [apiData, setApiData] = useState<unknown>(undefined);
  useEffect(() => {
    if (!userId) {
      setApiData(undefined);
      return;
    }
    let cancelled = false;
    void apiMatching
      .getCompatibilityBreakdown(userId)
      .then((d) => {
        if (!cancelled) setApiData(d);
      })
      .catch(() => {
        if (!cancelled) setApiData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);
  return apiData;
}

export function usePrivateRevealStatus(
  matchId: string | undefined,
  enabled = true
) {
  const [data, setData] = useState<unknown>(undefined);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled || !matchId) {
      setData(undefined);
      return;
    }
    let cancelled = false;
    void apiMatching
      .getPrivateRevealStatus(matchId)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [matchId, enabled, tick]);
  const refresh = useCallback(() => setTick((n) => n + 1), []);
  return { data, refresh };
}

export function useRevealPrivatePhoto() {
  return useCallback(async (matchId: string, mediaId?: string) => {
    return apiMatching.revealPrivatePhoto(matchId, mediaId);
  }, []);
}
