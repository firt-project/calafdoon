import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ModuleRef } from "@nestjs/core";
import { Queue, Worker, type Job, type ConnectionOptions } from "bullmq";
import { PaymentMailService } from "../mail/payment-mail.service";

export const PAYMENT_EMAIL_QUEUE = "payment-email";
export const PAYMENT_EMAIL_DLQ = "payment-email-dlq";
export const PAYMENT_RECONCILE_QUEUE = "payment-reconcile";
export const PAYMENT_RECONCILE_DLQ = "payment-reconcile-dlq";

export type PaymentEmailJob = {
  idempotencyKey: string;
  userId: string;
  to: string;
  subject: string;
  text: string;
  template: string;
};

export type PaymentReconcileJob = {
  kind: "abandoned" | "webhook_retry";
  cursor?: string;
};

@Injectable()
export class PaymentEmailQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentEmailQueueService.name);
  private queue: Queue<PaymentEmailJob> | null = null;
  private dlq: Queue<PaymentEmailJob> | null = null;
  private worker: Worker<PaymentEmailJob> | null = null;
  private readonly connectionOpts: ConnectionOptions;

  constructor(
    private readonly config: ConfigService,
    private readonly moduleRef: ModuleRef
  ) {
    const url = this.config.get<string>("REDIS_URL") ?? "redis://127.0.0.1:6379";
    this.connectionOpts = { url } as ConnectionOptions;
  }

  async onModuleInit() {
    try {
      this.queue = new Queue(PAYMENT_EMAIL_QUEUE, {
        connection: this.connectionOpts,
      });
      this.dlq = new Queue(PAYMENT_EMAIL_DLQ, {
        connection: this.connectionOpts,
      });
      this.worker = new Worker(
        PAYMENT_EMAIL_QUEUE,
        async (job: Job<PaymentEmailJob>) => {
          const mail = this.moduleRef.get(PaymentMailService, { strict: false });
          await mail.deliverNow({
            idempotencyKey: job.data.idempotencyKey,
            to: job.data.to,
            subject: job.data.subject,
            text: job.data.text,
          });
        },
        { connection: this.connectionOpts, concurrency: 2 }
      );
      this.worker.on("failed", async (job, err) => {
        this.logger.warn(`Payment email failed ${job?.id}: ${err.message}`);
        if (job && (job.attemptsMade ?? 0) >= (job.opts.attempts ?? 3)) {
          await this.dlq?.add("dead", job.data, {
            jobId: `dlq_${job.data.idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
          });
        }
      });
      this.logger.log("Payment email queue ready");
    } catch (err) {
      this.logger.error(
        `Payment email queue init failed: ${err instanceof Error ? err.message : "unknown"}`
      );
    }
  }

  async enqueue(data: PaymentEmailJob): Promise<void> {
    if (!this.queue) {
      const mail = this.moduleRef.get(PaymentMailService, { strict: false });
      await mail.deliverNow({
        idempotencyKey: data.idempotencyKey,
        to: data.to,
        subject: data.subject,
        text: data.text,
      });
      return;
    }
    await this.queue.add("send", data, {
      jobId: `mail_${data.idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
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

@Injectable()
export class PaymentReconcileQueueService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PaymentReconcileQueueService.name);
  private queue: Queue<PaymentReconcileJob> | null = null;
  private dlq: Queue<PaymentReconcileJob> | null = null;
  private worker: Worker<PaymentReconcileJob> | null = null;
  private readonly connectionOpts: ConnectionOptions;
  private processor:
    | ((job: PaymentReconcileJob) => Promise<void>)
    | null = null;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>("REDIS_URL") ?? "redis://127.0.0.1:6379";
    this.connectionOpts = { url } as ConnectionOptions;
  }

  setProcessor(fn: (job: PaymentReconcileJob) => Promise<void>) {
    this.processor = fn;
  }

  async onModuleInit() {
    try {
      this.queue = new Queue(PAYMENT_RECONCILE_QUEUE, {
        connection: this.connectionOpts,
      });
      this.dlq = new Queue(PAYMENT_RECONCILE_DLQ, {
        connection: this.connectionOpts,
      });
      this.worker = new Worker(
        PAYMENT_RECONCILE_QUEUE,
        async (job: Job<PaymentReconcileJob>) => {
          if (this.processor) await this.processor(job.data);
        },
        { connection: this.connectionOpts, concurrency: 1 }
      );
      this.worker.on("failed", async (job, err) => {
        this.logger.warn(`Reconcile failed ${job?.id}: ${err.message}`);
        if (job && (job.attemptsMade ?? 0) >= (job.opts.attempts ?? 3)) {
          await this.dlq?.add("dead", job.data, {
            jobId: `dlq-reconcile:${job.id}`,
          });
        }
      });
      await this.queue.add(
        "abandoned",
        { kind: "abandoned" },
        {
          jobId: "reconcile-abandoned-repeat",
          repeat: { every: 60 * 60 * 1000 },
          removeOnComplete: 100,
        }
      );
      this.logger.log("Payment reconcile queue ready");
    } catch (err) {
      this.logger.error(
        `Reconcile queue init failed: ${err instanceof Error ? err.message : "unknown"}`
      );
    }
  }

  async enqueue(data: PaymentReconcileJob, jobId?: string) {
    if (!this.queue) return;
    await this.queue.add(data.kind, data, {
      jobId: jobId ?? `reconcile:${data.kind}:${Date.now()}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    await this.dlq?.close();
  }
}
