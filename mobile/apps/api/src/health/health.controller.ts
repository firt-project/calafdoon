import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { Public } from "../auth/auth.guards";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.module";
import { ScoreQueueService } from "../queue/score-queue.service";
import { ChatGateway } from "../chat/chat.gateway";
import { MetricsService } from "../observability/metrics.service";
import { resolveCorsOrigins } from "../config/cors-origins";

type Probe = "up" | "down" | "skipped";

@Controller("health")
export class HealthController {
  private readonly s3: S3Client;
  private readonly profileBucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
    @Optional() private readonly scoreQueue?: ScoreQueueService,
    @Optional() private readonly chatGateway?: ChatGateway
  ) {
    const endpoint =
      this.config.get<string>("S3_ENDPOINT") ?? "http://127.0.0.1:9000";
    this.profileBucket =
      this.config.get<string>("S3_BUCKET_PROFILE") ?? "hel-profile";
    this.s3 = new S3Client({
      endpoint,
      region: this.config.get<string>("S3_REGION") ?? "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId:
          this.config.get<string>("S3_ACCESS_KEY_ID") ??
          this.config.get<string>("MINIO_ROOT_USER") ??
          "",
        secretAccessKey:
          this.config.get<string>("S3_SECRET_ACCESS_KEY") ??
          this.config.get<string>("MINIO_ROOT_PASSWORD") ??
          "",
      },
    });
  }

  @Public()
  @Get("live")
  live() {
    return {
      status: "ok",
      service: "hel-api",
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get()
  async check() {
    return this.buildStatus(false);
  }

  @Public()
  @Get("ready")
  async ready() {
    const body = await this.buildStatus(true);
    if (body.status !== "ok") {
      throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return body;
  }

  private async buildStatus(strict: boolean) {
    const database = await this.probeDb();
    const redis = await this.probeRedis();
    const objectStorage = await this.probeS3();
    const queues = await this.probeQueues();
    const sockets = this.chatGateway?.getConnectionCount?.() ?? 0;

    const criticalDown =
      database === "down" ||
      (strict && (redis === "down" || objectStorage === "down"));

    return {
      status: criticalDown ? "degraded" : "ok",
      service: "hel-api",
      phase: 21,
      authMe: "member-flags",
      chatImageUpload: "signed-put",
      photoDelivery: "signed-url",
      viewModal: "minimal-portal",
      adminActivity: "likes-arrays",
      homeFeed: "daily-match-liked-you",
      privateReveal: "one-time-match",
      corsOrigins: resolveCorsOrigins(),
      database,
      redis,
      objectStorage,
      queues,
      sockets: { connections: sockets },
      metrics: this.metrics.snapshot(),
      timestamp: new Date().toISOString(),
    };
  }

  private async probeDb(): Promise<Probe> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return "up";
    } catch {
      return "down";
    }
  }

  private async probeRedis(): Promise<Probe> {
    try {
      const ok = await this.redis.connect();
      return ok ? "up" : "down";
    } catch {
      return "down";
    }
  }

  private async probeS3(): Promise<Probe> {
    try {
      await this.s3.send(
        new HeadBucketCommand({ Bucket: this.profileBucket })
      );
      return "up";
    } catch {
      return "down";
    }
  }

  private async probeQueues(): Promise<Record<string, unknown>> {
    if (!this.scoreQueue?.getJobCounts) {
      return { compatibilityRecalc: "skipped" };
    }
    try {
      const counts = await this.scoreQueue.getJobCounts();
      return { compatibilityRecalc: counts };
    } catch (e) {
      return {
        compatibilityRecalc: "down",
        error: e instanceof Error ? e.message : "unknown",
      };
    }
  }
}
