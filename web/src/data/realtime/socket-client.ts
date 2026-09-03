import { io, type Socket } from "socket.io-client";
import { getSocketUrl } from "../provider";
import { track } from "../telemetry";

export type RealtimeEvent =
  | "message:new"
  | "conversation:updated"
  | "typing:update"
  | "unread:update"
  | "notification:new"
  | "session:revoked"
  | "presence:update";

type Handler = (payload: unknown) => void;

type ListenerEntry = {
  event: RealtimeEvent | string;
  handler: Handler;
};

let socket: Socket | null = null;
let refreshCallback: (() => void) | null = null;
let loggedConnectError = false;
const listeners = new Set<ListenerEntry>();
const joinedRooms = new Set<string>();

/**
 * True when the socket URL is the page origin itself, i.e. traffic goes through
 * the Next `/socket.io` rewrite to the upstream API. WebSocket upgrades through
 * a serverless proxy (Vercel) don't complete, so we stay on HTTP long-polling
 * and don't probe for an upgrade that just spams failed `wss://` attempts. A
 * direct api.* host (distinct origin) does WebSocket first as normal.
 */
function isViaSameOriginProxy(url: string): boolean {
  if (url.startsWith("/")) return true;
  if (typeof window === "undefined") return false;
  try {
    return new URL(url).origin === window.location.origin;
  } catch {
    return false;
  }
}

function ensureSocket(): Socket | null {
  if (socket) return socket;

  const url = getSocketUrl();
  const viaProxy = isViaSameOriginProxy(url);
  // H5: authenticate Socket.IO via HttpOnly session cookie (withCredentials).
  socket = io(url, {
    withCredentials: true,
    transports: viaProxy ? ["polling"] : ["websocket", "polling"],
    // No polling→websocket upgrade attempt when the upgrade can't succeed.
    upgrade: !viaProxy,
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 15_000,
    timeout: 20_000,
  });

  socket.on("connect_error", (err: Error) => {
    if (loggedConnectError) return;
    loggedConnectError = true;
    track("socket_connect_error");
    console.warn(
      `[realtime] Socket.IO could not connect to ${url} (${err.message}). ` +
        (viaProxy
          ? "Traffic is proxied through the page origin — the upstream API must " +
            "run a single instance or use sticky sessions for HTTP long-polling. " +
            "For WebSocket support, point NEXT_PUBLIC_SOCKET_URL at the API host directly."
          : "Check the API host and that its CORS allowlist includes this origin.")
    );
  });

  socket.on("connect", () => {
    loggedConnectError = false;
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
    "presence:update",
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
