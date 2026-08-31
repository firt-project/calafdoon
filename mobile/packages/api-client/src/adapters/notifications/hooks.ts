"use client";

import { useCallback, useEffect, useState } from "react";
import {
  connectRealtime,
  subscribeRealtime,
} from "../realtime/socket-client";
import { apiNotifications } from "./api";

export function useNotificationsList() {
  return useApiNotificationsList();
}

/**
 * The Nest API returns `{ items, nextCursor }` with string ids/dates, while
 * the UI expects an array of `{ _id, createdAt: number, ... }`.
 */
function normalizeNotificationsResponse(data: unknown): unknown[] {
  const list = Array.isArray(data)
    ? data
    : data && Array.isArray((data as { items?: unknown[] }).items)
      ? (data as { items: unknown[] }).items
      : [];
  return list.map((raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const n = raw as Record<string, unknown>;
    const createdAtRaw = n.createdAt;
    const createdAt =
      typeof createdAtRaw === "number"
        ? createdAtRaw
        : typeof createdAtRaw === "string"
          ? Date.parse(createdAtRaw) || Date.now()
          : Date.now();
    return { ...n, _id: n._id ?? n.id, createdAt };
  });
}

function useApiNotificationsList() {
  const [apiData, setApiData] = useState<unknown>(undefined);
  const refresh = useCallback(async () => {
    try {
      const data = await apiNotifications.list();
      setApiData(normalizeNotificationsResponse(data));
    } catch {
      setApiData([]);
    }
  }, []);
  useEffect(() => {
    void refresh();
    connectRealtime();
    return subscribeRealtime("notification:new", () => {
      void refresh();
    });
  }, [refresh]);
  return apiData;
}

export function useUnreadCount() {
  return useApiUnreadCount();
}

function useApiUnreadCount() {
  const [apiData, setApiData] = useState<unknown>(undefined);
  const refresh = useCallback(async () => {
    try {
      setApiData(await apiNotifications.unreadCount());
    } catch {
      setApiData(null);
    }
  }, []);
  useEffect(() => {
    void refresh();
    connectRealtime();
    const unsubN = subscribeRealtime("notification:new", () => void refresh());
    const unsubU = subscribeRealtime("unread:update", () => void refresh());
    return () => {
      unsubN();
      unsubU();
    };
  }, [refresh]);
  return apiData;
}

export function useMemberReminders() {
  return useApiReminders();
}

function useApiReminders() {
  const [apiData, setApiData] = useState<unknown>(undefined);
  useEffect(() => {
    let cancelled = false;
    void apiNotifications
      .getMemberReminders()
      .then((d) => {
        if (!cancelled) setApiData(Array.isArray(d) ? d : []);
      })
      .catch(() => {
        if (!cancelled) setApiData([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return apiData;
}

export function useMarkNotificationRead() {
  return useCallback(async (args: { notificationId: string } | string) => {
    const id = typeof args === "string" ? args : args.notificationId;
    return apiNotifications.markAsRead(id);
  }, []);
}

export function useMarkAllNotificationsRead() {
  return useCallback(async () => apiNotifications.markAllAsRead(), []);
}

export function useMarkNotificationsRead() {
  return useCallback(
    async (ids: string[]) => apiNotifications.markNotificationsRead(ids),
    []
  );
}
