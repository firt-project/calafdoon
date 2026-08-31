import { Injectable, Logger } from "@nestjs/common";
import { RedisService } from "../redis/redis.module";
import { TYPING_TTL_SECONDS } from "./chat.constants";

@Injectable()
export class TypingService {
  private readonly logger = new Logger(TypingService.name);

  constructor(private readonly redis: RedisService) {}

  private key(conversationId: string, userId: string) {
    return `typing:${conversationId}:${userId}`;
  }

  async setTyping(
    conversationId: string,
    userId: string,
    isTyping: boolean
  ): Promise<void> {
    const online = await this.redis.connect();
    if (!online || !this.redis.client) {
      this.logger.warn("Typing skipped — Redis unavailable");
      return;
    }
    const key = this.key(conversationId, userId);
    if (!isTyping) {
      await this.redis.client.del(key);
      return;
    }
    await this.redis.client.set(key, "1", "EX", TYPING_TTL_SECONDS);
  }

  /** True if any other participant currently has a typing key. */
  async isOtherTyping(
    conversationId: string,
    viewerId: string,
    participantUserIds: string[]
  ): Promise<boolean> {
    const online = await this.redis.connect();
    if (!online || !this.redis.client) return false;
    for (const uid of participantUserIds) {
      if (uid === viewerId) continue;
      const v = await this.redis.client.get(this.key(conversationId, uid));
      if (v) return true;
    }
    return false;
  }

  async listTypingUserIds(
    conversationId: string,
    participantUserIds: string[]
  ): Promise<string[]> {
    const online = await this.redis.connect();
    if (!online || !this.redis.client) return [];
    const out: string[] = [];
    for (const uid of participantUserIds) {
      const v = await this.redis.client.get(this.key(conversationId, uid));
      if (v) out.push(uid);
    }
    return out;
  }
}
