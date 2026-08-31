import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { parseLimit, maskEmail } from "./admin-auth.helpers";

@Injectable()
export class AdminPaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(opts: {
    status?: string;
    paymentType?: string;
    registrationTier?: string;
    from?: string;
    to?: string;
    cursor?: string;
    limit?: number;
  }) {
    const limit = parseLimit(String(opts.limit ?? 50), 50, 100);
    const where: Prisma.PaymentWhereInput = {};
    if (opts.status) where.status = opts.status as never;
    if (opts.paymentType) where.paymentType = opts.paymentType as never;
    if (opts.registrationTier) {
      where.registrationTier = opts.registrationTier as never;
    }
    if (opts.from || opts.to) {
      where.paymentCreatedAt = {
        ...(opts.from ? { gte: new Date(opts.from) } : {}),
        ...(opts.to ? { lte: new Date(opts.to) } : {}),
      };
    }
    if (opts.cursor) where.id = { lt: opts.cursor };

    const rows = await this.prisma.payment.findMany({
      where,
      orderBy: { paymentCreatedAt: "desc" },
      take: limit + 1,
      include: { user: { select: { email: true } } },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const items = [];
    for (const p of page) {
      const profile = await this.prisma.profile.findUnique({
        where: { userId: p.userId },
        select: { name: true, phone: true },
      });
      items.push({
        _id: p.id,
        id: p.id,
        amount: p.amount,
        status: p.status,
        paymentType: p.paymentType,
        registrationTier: p.registrationTier,
        createdAt: p.paymentCreatedAt.getTime(),
        fulfilledAt: p.fulfilledAt?.getTime() ?? null,
        userEmail: maskEmail(p.user.email),
        userName: profile?.name ?? "Unknown",
        profileName: profile?.name ?? null,
        userPhone: profile?.phone ?? null,
        stripeSessionId: p.stripeSessionId,
        stripeSessionIdPrefix: p.stripeSessionId.slice(0, 12) + "…",
      });
    }
    return {
      items,
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    };
  }

  async getById(id: string) {
    const p = await this.prisma.payment.findUnique({
      where: { id },
      include: { user: { select: { email: true } } },
    });
    if (!p) throw new NotFoundException("Payment not found");
    const profile = await this.prisma.profile.findUnique({
      where: { userId: p.userId },
      select: { name: true, id: true },
    });
    return {
      id: p.id,
      amount: p.amount,
      status: p.status,
      paymentType: p.paymentType,
      registrationTier: p.registrationTier,
      createdAt: p.paymentCreatedAt.toISOString(),
      fulfilledAt: p.fulfilledAt?.toISOString() ?? null,
      userEmail: maskEmail(p.user.email),
      profileName: profile?.name ?? null,
      profileId: profile?.id ?? null,
      stripeSessionIdPrefix: p.stripeSessionId.slice(0, 12) + "…",
    };
  }

  async stats() {
    const byStatus = await this.prisma.payment.groupBy({
      by: ["status"],
      _count: true,
      _sum: { amount: true },
    });
    const total = await this.prisma.payment.count();
    return {
      total,
      byStatus: Object.fromEntries(
        byStatus.map((s) => [
          s.status,
          { count: s._count, amountCents: s._sum.amount ?? 0 },
        ])
      ),
    };
  }

  /**
   * Quarantine summary: unique by sourceConvexId (not duplicate failure-log rows).
   */
  async quarantineSummary() {
    const failures = await this.prisma.migrationFailure.findMany({
      where: { tableName: "payments", reasonCode: "missing_user" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        convexId: true,
        reasonCode: true,
        safeDetail: true,
        createdAt: true,
      },
    });

    const byConvexId = new Map<string, (typeof failures)[0]>();
    for (const f of failures) {
      const key = f.convexId ?? f.id;
      if (!byConvexId.has(key)) byConvexId.set(key, f);
    }

    return {
      failureRowCount: failures.length,
      uniqueQuarantinedCount: byConvexId.size,
      items: [...byConvexId.values()].map((f) => ({
        convexId: f.convexId,
        reasonCode: f.reasonCode,
        safeDetail: f.safeDetail,
        firstSeenAt: f.createdAt.toISOString(),
      })),
      note: "Duplicate migration_failure rows are deduped by convexId. No attach/edit.",
    };
  }
}
