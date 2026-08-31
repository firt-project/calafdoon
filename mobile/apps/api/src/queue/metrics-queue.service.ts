import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue, Worker, type Job, type ConnectionOptions } from "bullmq";
import { MetricsService } from "../admin/metrics.service";

export const METRICS_QUEUE_NAME = "site-metrics-rebuild";

@Injectable()
export class MetricsQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MetricsQueueService.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private readonly connectionOpts: ConnectionOptions;

  constructor(
    private readonly config: ConfigService,
    @Inject(forwardRef(() => MetricsService))
    private readonly metrics: MetricsService
  ) {
    const url = this.config.get<string>("REDIS_URL") ?? "redis://127.0.0.1:6379";
    this.connectionOpts = { url } as ConnectionOptions;
  }

  async onModuleInit() {
    try {
      this.queue = new Queue(METRICS_QUEUE_NAME, {
        connection: this.connectionOpts,
      });
      this.worker = new Worker(
        METRICS_QUEUE_NAME,
        async (_job: Job) => {
          await this.metrics.rebuildFromStart();
        },
        { connection: this.connectionOpts, concurrency: 1 }
      );
      await this.queue.add(
        "periodic",
        {},
        {
          jobId: "metrics-periodic",
          repeat: { every: 30 * 60 * 1000 },
          removeOnComplete: 10,
          removeOnFail: 50,
        }
      );
      this.logger.log("Site metrics queue ready");
    } catch (err) {
      this.logger.error(
        `Metrics queue init failed: ${err instanceof Error ? err.message : "unknown"}`
      );
    }
  }

  async enqueueRebuild() {
    if (!this.queue) {
      this.logger.warn("Metrics queue unavailable — rebuilding inline");
      await this.metrics.rebuildFromStart();
      return;
    }
    await this.queue.add(
      "rebuild",
      {},
      {
        jobId: `metrics-rebuild-${Math.floor(Date.now() / 60_000)}`,
        removeOnComplete: 20,
        removeOnFail: 50,
      }
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }
}
