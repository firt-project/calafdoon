import { useCallback, useEffect, useRef, useState } from "react";
import { chat } from "@hel/api-client";
import { useRealtimeRefresh } from "@/platform/useRealtimeRefresh";

type Row = { unreadCount?: number };

/**
 * Total unread messages across conversations, kept live for the bottom-nav
 * badge. Cheap list query; refreshes on socket traffic and app resume.
 */
export function useInboxUnread(enabled: boolean): number {
  const [count, setCount] = useState(0);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const data = await chat.getConversations();
      if (!alive.current) return;
      const rows: Row[] = Array.isArray(data)
        ? (data as Row[])
        : data && typeof data === "object" && "items" in data
          ? (data as { items: Row[] }).items
          : [];
      setCount(rows.reduce((n, r) => n + Math.max(0, r.unreadCount ?? 0), 0));
    } catch {
      /* leave the last known count */
    }
  }, [enabled]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
    };
  }, [refresh]);

  useRealtimeRefresh(
    ["message:new", "conversation:updated", "unread:update"],
    () => void refresh(),
    { enabled }
  );

  return enabled ? count : 0;
}
