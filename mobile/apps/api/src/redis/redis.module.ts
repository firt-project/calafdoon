import { Global, Injectable, Logger, Module, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { sanitizeLogMessage } from "../observability/log-redact";
import { resolveRedisUrl } from "./redis-url";

export const REDIS_CLIENT = "REDIS_CLIENT";

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis | null;
  readonly available: boolean;

  constructor(config: ConfigService) {
    const url = resolveRedisUrl({
      redisUrl: config.get<string>("REDIS_URL"),
      redisPassword: config.get<string>("REDIS_PASSWORD"),
    });
    let client: Redis | null = null;
    let available = false;
    try {
      client = new Redis(url, {
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
        lazyConnect: true,
      });
      client.on("error", (err) => {
        this.logger.warn(`Redis error: ${sanitizeLogMessage(err.message)}`);
      });
      available = true;
    } catch (err) {
      this.logger.error(
        `Redis init failed: ${
          err instanceof Error ? sanitizeLogMessage(err.message) : "unknown"
        }`
      );
    }
    this.client = client;
    this.available = available;
  }

  async connect(): Promise<boolean> {
    if (!this.client) return false;
    try {
      if (this.client.status === "wait") {
        await this.client.connect();
      }
      const pong = await this.client.ping();
      return pong === "PONG";
    } catch (err) {
      this.logger.warn(
        `Redis unavailable: ${
          err instanceof Error ? sanitizeLogMessage(err.message) : "unknown"
        }`
      );
      return false;
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        this.client.disconnect();
      }
    }
  }
}

@Global()
@Module({
  providers: [
    RedisService,
    {
      provide: REDIS_CLIENT,
      useFactory: (redis: RedisService) => redis.client,
      inject: [RedisService],
    },
  ],
  exports: [RedisService, REDIS_CLIENT],
})
export class RedisModule {}
