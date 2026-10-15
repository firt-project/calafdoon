import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { PushService } from "./push.service";

const FIRST_RUN_MS = 2 * 60 * 1000;
const EVERY_MS = 3 * 60 * 60 * 1000;
const SILENT_AFTER_MS = 48 * 60 * 60 * 1000;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const BATCH = 100;

/**
 * One-time "say hello" reminder for active matches that stayed silent for 48h.
 * Claims each match atomically (nudgedAt) so restarts / multiple instances never double-send.
 */
@Injectable()
export class MatchNudgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MatchNudgeService.name);
  private first: NodeJS.Timeout | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === "test") return;
    this.first = setTimeout(() => {
      void this.run();
      this.timer = setInterval(() => void this.run(), EVERY_MS);
    }, FIRST_RUN_MS);
  }

  onModuleDestroy() {
    if (this.first) clearTimeout(this.first);
    if (this.timer) clearInterval(this.timer);
  }

  async run(): Promise<number> {
    let nudged = 0;
    try {
      const now = Date.now();
      const matches = await this.prisma.match.findMany({
        where: {
          status: "active",
          nudgedAt: null,
          createdAt: {
            lt: new Date(now - SILENT_AFTER_MS),
            gt: new Date(now - MAX_AGE_MS),
          },
          conversation: { is: { messages: { none: {} } } },
        },
        take: BATCH,
        orderBy: { createdAt: "asc" },
        select: { id: true, userAId: true, userBId: true },
      });
      for (const m of matches) {
        const blocked = await this.prisma.block.findFirst({
          where: {
            OR: [
              { blockerId: m.userAId, blockedId: m.userBId },
              { blockerId: m.userBId, blockedId: m.userAId },
            ],
          },
          select: { id: true },
        });
        // Claim first: only one runner proceeds.
        const claim = await this.prisma.match.updateMany({
          where: { id: m.id, nudgedAt: null },
          data: { nudgedAt: new Date() },
        });
        if (claim.count !== 1 || blocked) continue;
        await this.nudgePair(m.id, m.userAId, m.userBId);
        nudged += 1;
      }
      if (nudged) this.logger.log(`Sent ${nudged} match nudges`);
    } catch (err) {
      this.logger.warn(
        `Match nudge run failed: ${err instanceof Error ? err.message : "unknown"}`
      );
    }
    return nudged;
  }

  private async nudgePair(matchId: string, a: string, b: string) {
    const profiles = await this.prisma.profile.findMany({
      where: { userId: { in: [a, b] } },
      select: {
        userId: true,
        name: true,
        banned: true,
        user: { select: { convexId: true } },
      },
    });
    const byId = new Map(profiles.map((p) => [p.userId, p]));
    for (const [me, other] of [
      [a, b],
      [b, a],
    ] as const) {
      const mine = byId.get(me);
      const theirs = byId.get(other);
      if (!mine || !theirs || mine.banned || theirs.banned) continue;
      const title = "Say hello 👋";
      const body = `You matched with ${theirs.name} — start the conversation.`;
      try {
        await this.prisma.notification.create({
          data: {
            convexId: `local_notif_${randomUUID()}`,
            userId: me,
            convexUserId: mine.user.convexId,
            type: "match",
            title,
            body,
            read: false,
            relatedUserId: other,
            convexRelatedUserId: byId.get(other)?.user.convexId ?? null,
            sourceKey: `nudge:${matchId}:${me}`,
            notificationCreatedAt: new Date(),
          },
        });
      } catch {
        continue; // duplicate sourceKey — already nudged
      }
      void this.push.sendToUsers([me], {
        title,
        body,
        data: { type: "match", route: "/messages" },
        kind: "match",
      });
    }
  }
}
