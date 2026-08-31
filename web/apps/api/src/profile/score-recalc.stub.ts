import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ScoreQueueService } from "../queue/score-queue.service";

/**
 * Phase 6: enqueues BullMQ score recalculation (replaces audit-only stub).
 */
@Injectable()
export class ScoreRecalcStub {
  private readonly logger = new Logger(ScoreRecalcStub.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: ScoreQueueService
  ) {}

  async enqueue(userId: string, reason: string): Promise<void> {
    this.logger.log(
      JSON.stringify({ event: "score_recalc_enqueue", userId, reason })
    );
    await this.prisma.profileAuditEvent.create({
      data: {
        userId,
        action: "score_recalc_stub",
        metadata: { reason, queued: true },
      },
    });
    await this.queue.enqueueUserRecalculation(userId, reason);
  }
}
