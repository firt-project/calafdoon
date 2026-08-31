"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isAbortError, toLoadErrorMessage } from "../query-error";
import { apiMatching } from "./api";

function useApiMatches(
  filters: Record<string, unknown> | undefined,
  enabled: boolean
) {
  const [apiData, setApiData] = useState<unknown>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const filterKey = JSON.stringify(filters ?? {});
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) {
      abortRef.current?.abort();
      setApiData(undefined);
      setError(null);
      setIsRefreshing(false);
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setIsRefreshing(true);
    setError(null);
    void apiMatching
      .getMatches(filters, ac.signal)
      .then((d) => {
        if (!ac.signal.aborted) {
          setApiData(d);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted || isAbortError(err)) return;
        setError(toLoadErrorMessage(err));
        // Keep prior successful data when refresh fails; only clear on first load.
        setApiData((prev: unknown) => (prev === undefined ? null : prev));
      })
      .finally(() => {
        if (!ac.signal.aborted) setIsRefreshing(false);
      });
    return () => {
      ac.abort();
    };
  }, [filterKey, enabled, tick]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  const removeUser = useCallback((userId: string) => {
    setApiData((prev: unknown) => {
      if (!Array.isArray(prev)) return prev;
      return prev.filter((row) => {
        const item = row as { userId?: string };
        return item.userId !== userId;
      });
    });
  }, []);

  return { matches: apiData, isRefreshing, removeUser, error, refresh };
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
  const [lists, setLists] = useState<unknown>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setLists(undefined);
      setError(null);
      return;
    }
    let cancelled = false;
    setError(null);
    void apiMatching
      .getMatchLists(filters)
      .then((d) => {
        if (!cancelled) {
          setLists(d);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (cancelled || isAbortError(err)) return;
        setError(toLoadErrorMessage(err));
        setLists((prev: unknown) => (prev === undefined ? null : prev));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters ?? {}), enabled, tick]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);
  return { lists, error, refresh };
}

export function useMyMatches(enabled = true) {
  return useApiMyMatches(enabled);
}

function useApiMyMatches(enabled: boolean) {
  const [matches, setMatches] = useState<unknown>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setMatches(undefined);
      setError(null);
      return;
    }
    let cancelled = false;
    setError(null);
    void apiMatching
      .getMyMatches()
      .then((d) => {
        if (!cancelled) {
          setMatches(d);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (cancelled || isAbortError(err)) return;
        setError(toLoadErrorMessage(err));
        setMatches((prev: unknown) => (prev === undefined ? null : prev));
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, tick]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);
  return { matches, error, refresh };
}

export function useHomeFeed(enabled = true) {
  const [feed, setFeed] = useState<unknown>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setFeed(undefined);
      setError(null);
      return;
    }
    let cancelled = false;
    setError(null);
    void apiMatching
      .getHomeFeed()
      .then((d) => {
        if (!cancelled) {
          setFeed(d);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (cancelled || isAbortError(err)) return;
        setError(toLoadErrorMessage(err));
        setFeed((prev: unknown) => (prev === undefined ? null : prev));
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, tick]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);
  return { feed, error, refresh };
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

export function useStartChat() {
  return useCallback(async (targetUserId: string) => {
    if (!targetUserId) throw new Error("targetUserId required");
    return apiMatching.startChat(targetUserId);
  }, []);
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
  const [data, setData] = useState<unknown>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!userId) {
      setData(undefined);
      setError(null);
      return;
    }
    let cancelled = false;
    setError(null);
    void apiMatching
      .getCompatibilityBreakdown(userId)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (cancelled || isAbortError(err)) return;
        setError(toLoadErrorMessage(err));
        setData((prev: unknown) => (prev === undefined ? null : prev));
      });
    return () => {
      cancelled = true;
    };
  }, [userId, tick]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);
  return { data, error, refresh };
}

export function usePrivateRevealStatus(
  matchId: string | undefined,
  enabled = true
) {
  const [data, setData] = useState<unknown>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled || !matchId) {
      setData(undefined);
      setError(null);
      return;
    }
    let cancelled = false;
    setError(null);
    void apiMatching
      .getPrivateRevealStatus(matchId)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (cancelled || isAbortError(err)) return;
        setError(toLoadErrorMessage(err));
        setData((prev: unknown) => (prev === undefined ? null : prev));
      });
    return () => {
      cancelled = true;
    };
  }, [matchId, enabled, tick]);
  const refresh = useCallback(() => setTick((n) => n + 1), []);
  return { data, error, refresh };
}

export function useRevealPrivatePhoto() {
  return useCallback(async (matchId: string, mediaId?: string) => {
    return apiMatching.revealPrivatePhoto(matchId, mediaId);
  }, []);
}
