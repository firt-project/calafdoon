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
import { AnnouncementsService } from "../admin/announcements.service";

export const ANNOUNCEMENT_QUEUE_NAME = "announcement-fanout";

type FanoutJob = { announcementId: string };

@Injectable()
export class AnnouncementQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnnouncementQueueService.name);
  private queue: Queue<FanoutJob> | null = null;
  private worker: Worker<FanoutJob> | null = null;
  private readonly connectionOpts: ConnectionOptions;

  constructor(
    private readonly config: ConfigService,
    @Inject(forwardRef(() => AnnouncementsService))
    private readonly announcements: AnnouncementsService
  ) {
    const url = this.config.get<string>("REDIS_URL") ?? "redis://127.0.0.1:6379";
    this.connectionOpts = { url } as ConnectionOptions;
  }

  async onModuleInit() {
    try {
      this.queue = new Queue(ANNOUNCEMENT_QUEUE_NAME, {
        connection: this.connectionOpts,
      });
      this.worker = new Worker(
        ANNOUNCEMENT_QUEUE_NAME,
        async (job: Job<FanoutJob>) => {
          if (job.name === "deliver-due") {
            await this.announcements.deliverDueScheduled();
            return;
          }
          await this.announcements.fanOut(job.data.announcementId);
        },
        { connection: this.connectionOpts, concurrency: 2 }
      );
      // Cron every 5 minutes like Convex
      await this.queue.add(
        "deliver-due",
        { announcementId: "" },
        {
          jobId: "announcement-deliver-due",
          repeat: { every: 5 * 60 * 1000 },
          removeOnComplete: 20,
          removeOnFail: 50,
        }
      );
      this.logger.log("Announcement fanout queue ready");
    } catch (err) {
      this.logger.error(
        `Announcement queue init failed: ${err instanceof Error ? err.message : "unknown"}`
      );
    }
  }

  async enqueueFanout(announcementId: string) {
    if (!this.queue) {
      await this.announcements.fanOut(announcementId);
      return;
    }
    await this.queue.add(
      "fanout",
      { announcementId },
      {
        jobId: `ann-fanout-${announcementId}`,
        removeOnComplete: 100,
        removeOnFail: 200,
      }
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }
}
