"use client";

import { useEffect, useRef } from "react";
import type { Notification } from "@/types";
import { useMarkNotificationsRead as useAdapterMarkRead } from "@/data/notifications/hooks";

type NotificationType = Notification["type"];

export function useMarkNotificationsRead(
  types: NotificationType[],
  enabled = true,
  relatedUserId?: string
) {
  const mark = useAdapterMarkRead();
  const markedKeyRef = useRef<string | null>(null);
  const markKey = `${types.join(",")}:${relatedUserId ?? ""}`;

  useEffect(() => {
    if (!enabled || types.length === 0) return;
    if (markedKeyRef.current === markKey) return;
    markedKeyRef.current = markKey;
    void mark([]);
  }, [enabled, markKey, mark, relatedUserId, types]);
}
