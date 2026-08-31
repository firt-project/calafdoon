import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue, Worker, type Job, type ConnectionOptions } from "bullmq";
import { ScoreService } from "../matching/score.service";

export const SCORE_QUEUE_NAME = "compatibility-recalc";

export type ScoreJobData = {
  userId: string;
  reason: string;
  cursor?: number;
};

@Injectable()
export class ScoreQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScoreQueueService.name);
  private queue: Queue<ScoreJobData> | null = null;
  private worker: Worker<ScoreJobData> | null = null;
  private readonly connectionOpts: ConnectionOptions;

  constructor(
    private readonly config: ConfigService,
    private readonly scores: ScoreService
  ) {
    const url = this.config.get<string>("REDIS_URL") ?? "redis://127.0.0.1:6379";
    // Pass URL string so BullMQ uses its bundled ioredis (avoids type mismatch).
    this.connectionOpts = { url } as ConnectionOptions;
  }

  async onModuleInit() {
    try {
      this.queue = new Queue(SCORE_QUEUE_NAME, {
        connection: this.connectionOpts,
      });
      this.worker = new Worker(
        SCORE_QUEUE_NAME,
        async (job: Job<ScoreJobData>) => {
          await this.scores.processUserRecalculation(
            job.data.userId,
            job.data.cursor ?? 0,
            async (nextCursor) => {
              await this.enqueueUserRecalculation(
                job.data.userId,
                job.data.reason,
                nextCursor
              );
            }
          );
        },
        { connection: this.connectionOpts, concurrency: 2 }
      );
      this.worker.on("failed", (job, err) => {
        this.logger.warn(`Score job failed ${job?.id}: ${err.message}`);
      });
      this.logger.log("Score recalculation queue ready");
    } catch (err) {
      this.logger.error(
        `Score queue init failed: ${err instanceof Error ? err.message : "unknown"}`
      );
    }
  }

  async enqueueUserRecalculation(
    userId: string,
    reason: string,
    cursor = 0
  ): Promise<void> {
    if (!this.queue) {
      this.logger.warn(
        `Score queue unavailable — skipping enqueue for ${userId} (${reason})`
      );
      return;
    }
    const jobId =
      cursor === 0 ? `score-${userId}` : `score-${userId}-${cursor}`;
    await this.queue.add(
      "recalculate",
      { userId, reason, cursor },
      {
        jobId,
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      }
    );
  }

  async getJobCounts(): Promise<Record<string, number>> {
    if (!this.queue) return { waiting: 0, active: 0, completed: 0, failed: 0 };
    return this.queue.getJobCounts(
      "waiting",
      "active",
      "completed",
      "failed",
      "delayed"
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }
}
