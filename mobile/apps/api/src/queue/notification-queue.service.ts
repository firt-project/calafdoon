import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue, Worker, type Job, type ConnectionOptions } from "bullmq";

export const NOTIFICATION_QUEUE_NAME = "notification-email-stub";
export const NOTIFICATION_DLQ_NAME = "notification-email-dlq";

export type NotificationEmailJob = {
  notificationId: string;
  userId: string;
  type: string;
};

/**
 * Phase 7: queue email notification side-effects.
 * Does NOT call Resend — stubs only. Failed jobs move to DLQ after retries.
 */
@Injectable()
export class NotificationQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationQueueService.name);
  private queue: Queue<NotificationEmailJob> | null = null;
  private dlq: Queue<NotificationEmailJob> | null = null;
  private worker: Worker<NotificationEmailJob> | null = null;
  private readonly connectionOpts: ConnectionOptions;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>("REDIS_URL") ?? "redis://127.0.0.1:6379";
    this.connectionOpts = { url } as ConnectionOptions;
  }

  async onModuleInit() {
    try {
      this.queue = new Queue(NOTIFICATION_QUEUE_NAME, {
        connection: this.connectionOpts,
      });
      this.dlq = new Queue(NOTIFICATION_DLQ_NAME, {
        connection: this.connectionOpts,
      });
      this.worker = new Worker(
        NOTIFICATION_QUEUE_NAME,
        async (job: Job<NotificationEmailJob>) => {
          // Stub only — no Resend / production mail.
          this.logger.log(
            `email-stub skipped notification=${job.data.notificationId} type=${job.data.type}`
          );
        },
        { connection: this.connectionOpts, concurrency: 4 }
      );
      this.worker.on("failed", async (job, err) => {
        this.logger.warn(
          `Notification email stub failed ${job?.id}: ${err.message}`
        );
        if (job && (job.attemptsMade ?? 0) >= (job.opts.attempts ?? 3)) {
          await this.dlq?.add("dead", job.data, {
            jobId: `dlq-${job.data.notificationId}`,
          });
        }
      });
      this.logger.log("Notification email stub queue ready");
    } catch (err) {
      this.logger.error(
        `Notification queue init failed: ${err instanceof Error ? err.message : "unknown"}`
      );
    }
  }

  async enqueueEmailStub(data: NotificationEmailJob): Promise<void> {
    if (!this.queue) {
      this.logger.warn(
        `Notification queue unavailable — skipping email stub for ${data.notificationId}`
      );
      return;
    }
    await this.queue.add("email-stub", data, {
      jobId: `notif-email-${data.notificationId}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    await this.dlq?.close();
  }
}
