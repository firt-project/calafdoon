"use client";

import { useCallback, useEffect, useState } from "react";
import { apiSupport } from "./api";

function normalizeMine(d: unknown): unknown[] {
  const rows = Array.isArray(d)
    ? d
    : d && typeof d === "object" && Array.isArray((d as { items?: unknown[] }).items)
      ? (d as { items: unknown[] }).items
      : [];
  return rows.map((row) => {
    const item = row as Record<string, unknown>;
    const id =
      (typeof item._id === "string" && item._id) ||
      (typeof item.id === "string" && item.id) ||
      "";
    const thread = Array.isArray(item.thread)
      ? item.thread
      : Array.isArray(item.messages)
        ? item.messages
        : [];
    return { ...item, _id: id, id, thread };
  });
}

export function useMySupportMessages() {
  const [apiData, setApiData] = useState<unknown>(undefined);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => {
    let cancelled = false;
    void apiSupport
      .listMine()
      .then((d) => {
        if (!cancelled) setApiData(normalizeMine(d));
      })
      .catch(() => {
        if (!cancelled) setApiData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);
  return { messages: apiData, reload };
}

export function useSendSupportMessage() {
  return useCallback(
    async (body: Record<string, unknown>) => apiSupport.create(body),
    []
  );
}

export function useReplyAsMember() {
  return useCallback(
    async (args: { contactId: string; message: string }) =>
      apiSupport.replyAsMember(args.contactId, args.message),
    []
  );
}

export function useSendPublicContact() {
  return useCallback(
    async (body: Record<string, unknown>) =>
      apiSupport.sendPublicContact(body),
    []
  );
}

export function useAdminReplySupport() {
  return useCallback(
    async (args: { contactId: string; message: string }) =>
      apiSupport.admin.reply(args.contactId, args.message),
    []
  );
}

export function useAdminUpdateSupportStatus() {
  return useCallback(
    async (args: {
      contactId: string;
      status: string;
      adminNotes?: string;
    }) => apiSupport.admin.updateStatus(args.contactId, args.status),
    []
  );
}
