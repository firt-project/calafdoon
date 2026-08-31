import { IoAdapter } from "@nestjs/platform-socket.io";
import type { INestApplication } from "@nestjs/common";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import type { ServerOptions } from "socket.io";

/**
 * Socket.IO Redis adapter for multi-instance room fanout.
 * Falls back to in-memory adapter if Redis is unavailable (local single-node).
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;

  constructor(
    app: INestApplication,
    private readonly redisUrl: string
  ) {
    super(app);
  }

  async connectToRedis(): Promise<boolean> {
    try {
      this.pubClient = new Redis(this.redisUrl, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
      });
      this.subClient = this.pubClient.duplicate();
      await Promise.all([this.pubClient.connect(), this.subClient.connect()]);
      this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
      return true;
    } catch {
      await this.close();
      return false;
    }
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }

  async close() {
    try {
      await this.pubClient?.quit();
    } catch {
      this.pubClient?.disconnect();
    }
    try {
      await this.subClient?.quit();
    } catch {
      this.subClient?.disconnect();
    }
    this.pubClient = null;
    this.subClient = null;
    this.adapterConstructor = null;
  }
}
