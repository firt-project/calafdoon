import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Server, Socket } from "socket.io";
import { SessionService } from "../auth/session.service";
import { isStaffMfaRequired } from "../auth/staff-mfa-policy";
import { isStaffRole } from "../common/access";
import { isInteractionLocked } from "../common/review-status";
import { PresenceService } from "../presence/presence.service";
import { ConversationService } from "./conversation.service";
import { ChatRealtimeService } from "./chat-realtime.service";
import { RedisService } from "../redis/redis.module";
import { resolveCorsOrigins } from "../config/cors-origins";

type AuthedSocket = Socket & {
  data: {
    userId?: string;
    sessionId?: string;
    role?: string;
    banned?: boolean;
  };
};

function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    out[k] = v;
  }
  return out;
}

@WebSocketGateway({
  cors: {
    origin: resolveCorsOrigins(),
    credentials: true,
  },
  transports: ["websocket", "polling"],
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly sessions: SessionService,
    private readonly conversations: ConversationService,
    private readonly realtime: ChatRealtimeService,
    private readonly redis: RedisService,
    private readonly presence: PresenceService,
    private readonly config: ConfigService
  ) {}

  afterInit(server: Server) {
    this.realtime.attach(server);
    // Auth must run in middleware — Nest does not await async handleConnection.
    server.use(async (socket, next) => {
      try {
        await this.authenticate(socket as AuthedSocket);
        next();
      } catch (err) {
        next(err as Error);
      }
    });
    this.logger.log("Chat Socket.IO gateway ready");
  }

  /** Aggregate connection count for /health — no PII. */
  getConnectionCount(): number {
    try {
      return this.server?.engine?.clientsCount ?? this.server?.sockets?.sockets?.size ?? 0;
    } catch {
      return 0;
    }
  }

  private async rateSocketConnect(ip: string): Promise<boolean> {
    const online = await this.redis.connect();
    if (!online || !this.redis.client) {
      // Degrade open on connect — message mutations still fail closed via HTTP/service.
      return true;
    }
    const key = `rl:socket.connect:ip:${ip}`;
    const count = await this.redis.client.incr(key);
    if (count === 1) await this.redis.client.expire(key, 60);
    return count <= 60;
  }

  private async authenticate(client: AuthedSocket) {
    const ip =
      client.handshake.address ||
      (client.handshake.headers["x-forwarded-for"] as string) ||
      "unknown";
    const allowed = await this.rateSocketConnect(ip);
    if (!allowed) {
      throw new Error("rate_limited");
    }

    const cookies = parseCookieHeader(client.handshake.headers.cookie);
    const cookieToken = cookies["hel_session"];
    const authToken =
      typeof client.handshake.auth?.token === "string"
        ? client.handshake.auth.token
        : undefined;
    const headerToken =
      typeof client.handshake.headers["x-session-token"] === "string"
        ? client.handshake.headers["x-session-token"]
        : undefined;
    if (
      cookieToken &&
      ((authToken && authToken !== cookieToken) ||
        (headerToken && headerToken !== cookieToken))
    ) {
      throw new Error("ambiguous_session");
    }
    const raw = cookieToken || authToken || headerToken;

    if (!raw) throw new Error("unauthenticated");

    const session = await this.sessions.findValidSession(raw);
    if (!session) throw new Error("invalid_session");

    if (session.user.mustResetPassword) {
      throw new Error("password_reset_required");
    }

    if (session.user.emailVerificationTime == null) {
      throw new Error("email_verification_required");
    }

    const profile = session.user.profile;
    const role = profile?.role ?? "user";
    if (
      isStaffMfaRequired(this.config) &&
      isStaffRole(role) &&
      session.user.mfaEnabled !== true
    ) {
      throw new Error("mfa_enrollment_required");
    }

    if (profile && isInteractionLocked(profile)) {
      throw new Error(profile.banned ? "banned" : "paused");
    }

    client.data.userId = session.user.id;
    client.data.sessionId = session.id;
    client.data.role = role;
    client.data.banned = false;
    await client.join(`user:${session.user.id}`);
  }

  /** Notify everyone connected that this user's online status changed. */
  private async broadcastPresence(userId: string, isOnline: boolean) {
    try {
      this.realtime.emitToAll("presence:update", {
        userId,
        isOnline,
      });
    } catch (err) {
      this.logger.warn(
        `presence broadcast failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  async handleConnection(client: AuthedSocket) {
    if (!client.data.userId) {
      client.emit("session:revoked", { reason: "unauthenticated" });
      client.disconnect(true);
      return;
    }
    const newlyOnline = await this.presence.markConnected(
      client.data.userId,
      client.id
    );
    if (newlyOnline) {
      await this.broadcastPresence(client.data.userId, true);
    }
  }

  async handleDisconnect(client: AuthedSocket) {
    const userId = client.data.userId;
    if (!userId) return;
    const wentOffline = await this.presence.markDisconnected(userId, client.id);
    if (wentOffline) {
      await this.broadcastPresence(userId, false);
    }
  }

  private requireUser(client: AuthedSocket): string {
    if (!client.data.userId) {
      client.emit("session:revoked", { reason: "unauthenticated" });
      client.disconnect(true);
      throw new Error("unauthenticated");
    }
    return client.data.userId;
  }

  @SubscribeMessage("presence:ping")
  async onPresencePing(@ConnectedSocket() client: AuthedSocket) {
    try {
      const userId = this.requireUser(client);
      await this.presence.heartbeat(userId);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  @SubscribeMessage("conversation:join")
  async onJoin(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { conversationId?: string }
  ) {
    try {
      const userId = this.requireUser(client);
      const conversationId = body?.conversationId;
      if (!conversationId) return { ok: false, error: "conversationId required" };
      await this.conversations.assertSocketJoin(userId, conversationId);
      await client.join(`conversation:${conversationId}`);
      return { ok: true, conversationId };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "join denied",
      };
    }
  }

  @SubscribeMessage("conversation:leave")
  async onLeave(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { conversationId?: string }
  ) {
    if (body?.conversationId) {
      await client.leave(`conversation:${body.conversationId}`);
    }
    return { ok: true };
  }

  @SubscribeMessage("message:send")
  async onSend(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody()
    body: {
      conversationId?: string;
      message?: string;
      imageMediaId?: string;
      idempotencyKey?: string;
    }
  ) {
    try {
      const userId = this.requireUser(client);
      if (!body?.conversationId) {
        return { ok: false, error: "conversationId required" };
      }
      const msg = await this.conversations.sendMessage(
        userId,
        body.conversationId,
        {
          message: body.message,
          imageMediaId: body.imageMediaId,
          idempotencyKey: body.idempotencyKey,
        },
        { socketId: client.id }
      );
      return { ok: true, message: msg };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "send failed",
      };
    }
  }

  @SubscribeMessage("typing:start")
  async onTypingStart(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { conversationId?: string }
  ) {
    try {
      const userId = this.requireUser(client);
      if (!body?.conversationId) return { ok: false };
      await this.conversations.setTyping(userId, body.conversationId, true);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  @SubscribeMessage("typing:stop")
  async onTypingStop(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { conversationId?: string }
  ) {
    try {
      const userId = this.requireUser(client);
      if (!body?.conversationId) return { ok: false };
      await this.conversations.setTyping(userId, body.conversationId, false);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  @SubscribeMessage("messages:read")
  async onRead(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { conversationId?: string }
  ) {
    try {
      const userId = this.requireUser(client);
      if (!body?.conversationId) return { ok: false };
      await this.conversations.markRead(userId, body.conversationId);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "read failed",
      };
    }
  }
}
