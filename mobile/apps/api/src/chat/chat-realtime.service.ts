import { Injectable } from "@nestjs/common";
import type { Server } from "socket.io";

/**
 * Thin bridge so HTTP services can emit Socket.IO events without circular DI.
 * Gateway registers the server on init.
 */
@Injectable()
export class ChatRealtimeService {
  private server: Server | null = null;

  attach(server: Server) {
    this.server = server;
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  emitToConversation(
    conversationId: string,
    event: string,
    payload: unknown,
    exceptSocketId?: string
  ) {
    const room = this.server?.to(`conversation:${conversationId}`);
    if (!room) return;
    if (exceptSocketId) {
      room.except(exceptSocketId).emit(event, payload);
    } else {
      room.emit(event, payload);
    }
  }

  emitToUsers(userIds: string[], event: string, payload: unknown) {
    for (const id of userIds) {
      this.emitToUser(id, event, payload);
    }
  }
}
