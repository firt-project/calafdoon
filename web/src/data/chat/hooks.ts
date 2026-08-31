"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  connectRealtime,
  joinConversation,
  leaveConversation,
  subscribeRealtime,
} from "../realtime/socket-client";
import { isAbortError, toLoadErrorMessage } from "../query-error";
import { apiChat } from "./api";

export function useConversations(opts?: { list?: string; enabled?: boolean }) {
  const enabled = opts?.enabled !== false;
  const list = opts?.list;
  return useApiConversations(enabled ? list : undefined, enabled);
}

function useApiConversations(list: string | undefined, enabled: boolean) {
  const [conversations, setConversations] = useState<unknown>(undefined);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const data = await apiChat.getConversations(list ? { list } : undefined);
      setConversations(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err: unknown) {
      if (isAbortError(err)) return;
      setError(toLoadErrorMessage(err));
      setConversations((prev: unknown) => (prev === undefined ? null : prev));
    }
  }, [enabled, list]);

  useEffect(() => {
    if (!enabled) {
      setConversations(undefined);
      setError(null);
      return;
    }
    void refresh();
    connectRealtime();
    return subscribeRealtime("conversation:updated", () => {
      void refresh();
    });
  }, [refresh, enabled]);

  return { conversations, error, refresh };
}

export function useMessages(conversationId: string | undefined) {
  return useApiMessages(conversationId);
}

function useApiMessages(conversationId: string | undefined) {
  const [apiData, setApiData] = useState<unknown>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const requestSeq = useRef(0);

  const refresh = useCallback(async () => {
    if (!conversationId) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const seq = ++requestSeq.current;
    setIsRefreshing(true);
    try {
      const data = await apiChat.getMessages(conversationId, { signal: ac.signal });
      if (seq === requestSeq.current && !ac.signal.aborted) {
        setApiData(Array.isArray(data) ? data : []);
        setError(null);
      }
    } catch (err: unknown) {
      if (ac.signal.aborted || isAbortError(err)) return;
      if (seq === requestSeq.current) {
        setError(toLoadErrorMessage(err));
        setApiData((prev: unknown) => (prev === undefined ? null : prev));
      }
    } finally {
      if (seq === requestSeq.current && !ac.signal.aborted) {
        setIsRefreshing(false);
      }
    }
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) {
      abortRef.current?.abort();
      setApiData(undefined);
      setError(null);
      setIsRefreshing(false);
      return;
    }
    setApiData(undefined);
    setError(null);
    void refresh();
    connectRealtime();
    joinConversation(conversationId);
    const unsub = subscribeRealtime("message:new", () => {
      void refresh();
    });
    return () => {
      unsub();
      leaveConversation(conversationId);
      abortRef.current?.abort();
    };
  }, [conversationId, refresh]);

  return { messages: apiData, isRefreshing, refresh, error };
}

export function useSendMessage() {
  return useCallback(
    async (args: {
      conversationId: string;
      message?: string;
      imageMediaId?: string;
      imageId?: string;
      storageId?: string;
      idempotencyKey?: string;
    }) =>
      apiChat.sendMessage(args.conversationId, {
        message: args.message,
        imageMediaId: args.imageMediaId ?? args.imageId ?? args.storageId,
        idempotencyKey: args.idempotencyKey,
      }),
    []
  );
}

/** Upload a chat attachment via the Nest chat adapter. */
export function useUploadChatImage() {
  return useCallback(
    async (conversationId: string, file: File) =>
      apiChat.uploadChatImage(conversationId, file),
    []
  );
}

export function useMarkAsRead() {
  return useCallback(async (args: { conversationId: string } | string) => {
    const id = typeof args === "string" ? args : args.conversationId;
    return apiChat.markAsRead(id);
  }, []);
}

export function useSetTyping() {
  return useCallback(
    async (args: {
      conversationId: string;
      typing?: boolean;
      isTyping?: boolean;
    }) =>
      apiChat.setTyping(
        args.conversationId,
        args.typing ?? args.isTyping ?? false
      ),
    []
  );
}

export function useTypingStatus(conversationId: string | undefined) {
  return useApiTyping(conversationId);
}

function useApiTyping(conversationId: string | undefined) {
  const [apiData, setApiData] = useState<unknown>(undefined);
  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const d = await apiChat.getTypingStatus(conversationId);
        if (!cancelled) setApiData(d);
      } catch {
        // Typing indicators are best-effort — don't block the chat UI.
      }
    };
    void poll();
    const unsub = subscribeRealtime("typing:update", () => {
      void poll();
    });
    const t = setInterval(() => void poll(), 5_000);
    return () => {
      cancelled = true;
      unsub();
      clearInterval(t);
    };
  }, [conversationId]);
  return apiData;
}
