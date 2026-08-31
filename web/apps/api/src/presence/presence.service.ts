import { Injectable, Logger } from "@nestjs/common";
import { RedisService } from "../redis/redis.module";

/** How long a user stays "online" without a heartbeat or open socket. */
export const PRESENCE_TTL_SECONDS = 90;

@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);

  constructor(private readonly redis: RedisService) {}

  private onlineKey(userId: string) {
    return `presence:online:${userId}`;
  }

  private socksKey(userId: string) {
    return `presence:socks:${userId}`;
  }

  async markConnected(userId: string, socketId: string): Promise<boolean> {
    const online = await this.redis.connect();
    if (!online || !this.redis.client) return false;
    const client = this.redis.client;
    const wasOnline = !!(await client.get(this.onlineKey(userId)));
    await client.sadd(this.socksKey(userId), socketId);
    await client.expire(this.socksKey(userId), PRESENCE_TTL_SECONDS);
    await client.set(this.onlineKey(userId), "1", "EX", PRESENCE_TTL_SECONDS);
    return !wasOnline;
  }

  async markDisconnected(userId: string, socketId: string): Promise<boolean> {
    const online = await this.redis.connect();
    if (!online || !this.redis.client) return false;
    const client = this.redis.client;
    await client.srem(this.socksKey(userId), socketId);
    const remaining = await client.scard(this.socksKey(userId));
    if (remaining > 0) {
      await client.expire(this.socksKey(userId), PRESENCE_TTL_SECONDS);
      await client.expire(this.onlineKey(userId), PRESENCE_TTL_SECONDS);
      return false;
    }
    await client.del(this.onlineKey(userId), this.socksKey(userId));
    return true;
  }

  async heartbeat(userId: string): Promise<void> {
    const online = await this.redis.connect();
    if (!online || !this.redis.client) return;
    const client = this.redis.client;
    const socks = await client.scard(this.socksKey(userId));
    if (socks <= 0) return;
    await client.expire(this.socksKey(userId), PRESENCE_TTL_SECONDS);
    await client.set(this.onlineKey(userId), "1", "EX", PRESENCE_TTL_SECONDS);
  }

  async isOnline(userId: string): Promise<boolean> {
    const online = await this.redis.connect();
    if (!online || !this.redis.client) return false;
    const v = await this.redis.client.get(this.onlineKey(userId));
    return !!v;
  }

  async areOnline(userIds: string[]): Promise<Map<string, boolean>> {
    const out = new Map<string, boolean>();
    for (const id of userIds) out.set(id, false);
    if (userIds.length === 0) return out;

    const online = await this.redis.connect();
    if (!online || !this.redis.client) return out;

    try {
      const keys = userIds.map((id) => this.onlineKey(id));
      const values = await this.redis.client.mget(...keys);
      userIds.forEach((id, i) => {
        out.set(id, !!values[i]);
      });
    } catch (err) {
      this.logger.warn(
        `areOnline failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    return out;
  }
}
