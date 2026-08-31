"use client";

import { useCallback, useEffect, useState } from "react";
import { isAbortError, toLoadErrorMessage } from "../query-error";
import { apiProfile } from "./api";

const POLL_MS = 15_000;

export function useProfile() {
  const [apiData, setApiData] = useState<unknown>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await apiProfile.getProfile();
      setApiData(next);
      setError(null);
      return next;
    } catch (err: unknown) {
      if (!isAbortError(err)) {
        setError(toLoadErrorMessage(err));
        // Keep last good profile on poll failure; only null on first failure.
        setApiData((prev: unknown) => (prev === undefined ? null : prev));
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  return { profile: apiData, loading, refresh, error };
}

export function usePreferencesQuery() {
  return useApiPreferences().preferences;
}

/** Preferences plus a refresh helper. */
export function usePreferences() {
  return useApiPreferences();
}

function useApiPreferences() {
  const [preferences, setPreferences] = useState<unknown>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { apiPreferences } = await import("../preferences/api");
      const next = await apiPreferences.getPreferences();
      setPreferences(next);
      setError(null);
      return next;
    } catch (err: unknown) {
      if (!isAbortError(err)) {
        setError(toLoadErrorMessage(err));
        setPreferences((prev: unknown) => (prev === undefined ? null : prev));
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  return { preferences, loading, refresh, error };
}

export function useWaliForMatch(targetUserId: string | undefined) {
  const [apiData, setApiData] = useState<unknown>(undefined);
  useEffect(() => {
    if (!targetUserId) {
      setApiData(undefined);
      return;
    }
    let cancelled = false;
    // Nest may expose wali on match detail later; safe empty for now.
    void apiProfile
      .getProfile()
      .then(() => {
        if (!cancelled) setApiData(null);
      })
      .catch(() => {
        if (!cancelled) setApiData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [targetUserId]);
  return apiData;
}
