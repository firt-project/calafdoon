import { io, type Socket } from "socket.io-client";
import { getApiSessionToken } from "../api-client";
import { getSocketUrl } from "../provider";
import { track } from "../telemetry";

export type RealtimeEvent =
  | "message:new"
  | "conversation:updated"
  | "typing:update"
  | "unread:update"
  | "notification:new"
  | "session:revoked";

type Handler = (payload: unknown) => void;

type ListenerEntry = {
  event: RealtimeEvent | string;
  handler: Handler;
};

let socket: Socket | null = null;
let refreshCallback: (() => void) | null = null;
const listeners = new Set<ListenerEntry>();
const joinedRooms = new Set<string>();

function ensureSocket(): Socket | null {
  if (socket) return socket;

  const url = getSocketUrl();
  const sessionToken = getApiSessionToken();
  socket = io(url, {
    withCredentials: true,
    auth: sessionToken ? { token: sessionToken } : undefined,
    transports: ["websocket", "polling"],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 15_000,
    timeout: 20_000,
  });

  socket.on("connect", () => {
    // Re-join rooms after reconnect
    for (const id of joinedRooms) {
      socket?.emit("conversation:join", { conversationId: id });
    }
  });

  socket.on("reconnect", () => {
    track("socket_reconnect");
    refreshCallback?.();
  });

  socket.on("session:revoked", (payload) => {
    for (const entry of listeners) {
      if (entry.event === "session:revoked") entry.handler(payload);
    }
  });

  // Fan-out registered events
  const fanoutEvents: RealtimeEvent[] = [
    "message:new",
    "conversation:updated",
    "typing:update",
    "unread:update",
    "notification:new",
    "session:revoked",
  ];
  for (const ev of fanoutEvents) {
    socket.on(ev, (payload: unknown) => {
      for (const entry of listeners) {
        if (entry.event === ev) entry.handler(payload);
      }
    });
  }

  return socket;
}

export function setRealtimeRefreshCallback(cb: (() => void) | null): void {
  refreshCallback = cb;
}

export function connectRealtime(): Socket | null {
  return ensureSocket();
}

export function disconnectRealtime(): void {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
  joinedRooms.clear();
}

export function subscribeRealtime(
  event: RealtimeEvent | string,
  handler: Handler
): () => void {
  ensureSocket();
  const entry: ListenerEntry = { event, handler };
  listeners.add(entry);
  return () => {
    listeners.delete(entry);
  };
}

export function joinConversation(conversationId: string): void {
  const s = ensureSocket();
  joinedRooms.add(conversationId);
  s?.emit("conversation:join", { conversationId });
}

export function leaveConversation(conversationId: string): void {
  const s = ensureSocket();
  joinedRooms.delete(conversationId);
  s?.emit("conversation:leave", { conversationId });
}

export function getRealtimeSocket(): Socket | null {
  return socket;
}
