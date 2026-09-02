import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { parseLimit, maskEmail } from "./admin-auth.helpers";
import {
  gatewayWhere,
  inferMembershipType,
  inferPaymentGateway,
  isPaymentGateway,
  utcDayKey,
  type PaymentGateway,
} from "../payments/payment-gateway";

type DateRange = { gte?: Date; lte?: Date };

function parseDateRange(from?: string, to?: string): DateRange | undefined {
  const range: DateRange = {};
  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) range.gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (!Number.isNaN(d.getTime())) range.lte = d;
  }
  return range.gte || range.lte ? range : undefined;
}

function mapPaymentRow(
  p: {
    id: string;
    userId: string;
    amount: number;
    status: string;
    paymentType: string | null;
    registrationTier: string | null;
    paymentCreatedAt: Date;
    fulfilledAt: Date | null;
    stripeSessionId: string;
    fulfillmentKey: string | null;
    user: { email: string | null };
  },
  profile:
    | {
        name: string;
        phone: string | null;
        id: string;
        hasPaid: boolean;
        paidUntil: Date | null;
      }
    | undefined
) {
  const gateway = inferPaymentGateway(p);
  const membershipType = inferMembershipType({
    hasPaid: profile?.hasPaid ?? false,
    paidUntil: profile?.paidUntil,
    gateway,
  });
  return {
    _id: p.id,
    id: p.id,
    userId: p.userId,
    profileId: profile?.id ?? null,
    amount: p.amount,
    status: p.status,
    paymentType: p.paymentType,
    registrationTier: p.registrationTier,
    gateway,
    membershipType,
    paidUntil: profile?.paidUntil?.toISOString() ?? null,
    createdAt: p.paymentCreatedAt.getTime(),
    fulfilledAt: p.fulfilledAt?.getTime() ?? null,
    userEmail: maskEmail(p.user.email),
    userName: profile?.name ?? "Unknown",
    profileName: profile?.name ?? null,
    userPhone: profile?.phone ?? null,
    stripeSessionIdPrefix: p.stripeSessionId.slice(0, 16) + "…",
    fulfillmentKeyPrefix: p.fulfillmentKey
      ? p.fulfillmentKey.slice(0, 20) + "…"
      : null,
  };
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

@Injectable()
export class AdminPaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(opts: {
    status?: string;
    paymentType?: string;
    registrationTier?: string;
    gateway?: string;
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
    if (opts.gateway && isPaymentGateway(opts.gateway)) {
      Object.assign(where, gatewayWhere(opts.gateway));
    }
    const dateRange = parseDateRange(opts.from, opts.to);
    if (dateRange) where.paymentCreatedAt = dateRange;
    if (opts.cursor) where.id = { lt: opts.cursor };

    const rows = await this.prisma.payment.findMany({
      where,
      orderBy: { paymentCreatedAt: "desc" },
      take: limit + 1,
      include: { user: { select: { email: true } } },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const userIds = [...new Set(page.map((p) => p.userId))];
    const profiles = userIds.length
      ? await this.prisma.profile.findMany({
          where: { userId: { in: userIds } },
          select: {
            userId: true,
            name: true,
            phone: true,
            id: true,
            hasPaid: true,
            paidUntil: true,
          },
        })
      : [];
    const profileByUser = new Map(profiles.map((p) => [p.userId, p]));

    const items = page.map((p) =>
      mapPaymentRow(p, profileByUser.get(p.userId))
    );

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
      select: {
        name: true,
        id: true,
        phone: true,
        gender: true,
        hasPaid: true,
        paidUntil: true,
      },
    });
    const gateway = inferPaymentGateway(p);
    const membershipType = inferMembershipType({
      hasPaid: profile?.hasPaid ?? false,
      paidUntil: profile?.paidUntil,
      gateway,
    });
    return {
      id: p.id,
      userId: p.userId,
      amount: p.amount,
      status: p.status,
      paymentType: p.paymentType,
      registrationTier: p.registrationTier,
      gateway,
      membershipType,
      paidUntil: profile?.paidUntil?.toISOString() ?? null,
      createdAt: p.paymentCreatedAt.toISOString(),
      fulfilledAt: p.fulfilledAt?.toISOString() ?? null,
      userEmail: maskEmail(p.user.email),
      profileName: profile?.name ?? null,
      profileId: profile?.id ?? null,
      profileGender: profile?.gender ?? null,
      userPhone: profile?.phone ?? null,
      stripeSessionIdPrefix: p.stripeSessionId.slice(0, 16) + "…",
      fulfillmentKeyPrefix: p.fulfillmentKey
        ? p.fulfillmentKey.slice(0, 24) + "…"
        : null,
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

  /** Revenue and counts per gateway + EVC queue summary. */
  async dashboard(opts?: { from?: string; to?: string }) {
    const dateRange = parseDateRange(opts?.from, opts?.to);
    const dateWhere: Prisma.PaymentWhereInput = dateRange
      ? { paymentCreatedAt: dateRange }
      : {};

    const gateways: PaymentGateway[] = [
      "stripe",
      "waafi",
      "paystack",
      "manual",
    ];
    const emptyGatewayBucket = () => ({
      completedCount: 0,
      completedRevenueCents: 0,
      pendingCount: 0,
      failedCount: 0,
    });
    const byGateway: Record<
      PaymentGateway,
      ReturnType<typeof emptyGatewayBucket>
    > = {
      stripe: emptyGatewayBucket(),
      waafi: emptyGatewayBucket(),
      paystack: emptyGatewayBucket(),
      manual: emptyGatewayBucket(),
    };

    for (const gateway of gateways) {
      for (const status of ["completed", "pending", "failed"] as const) {
        const agg = await this.prisma.payment.aggregate({
          where: {
            ...dateWhere,
            status,
            ...gatewayWhere(gateway),
          },
          _count: true,
          _sum: { amount: true },
        });
        if (status === "completed") {
          byGateway[gateway].completedCount = agg._count;
          byGateway[gateway].completedRevenueCents = agg._sum.amount ?? 0;
        } else if (status === "pending") {
          byGateway[gateway].pendingCount = agg._count;
        } else {
          byGateway[gateway].failedCount = agg._count;
        }
      }
    }

    const evcPending = await this.prisma.evcPaymentProof.count({
      where: { status: "pending" },
    });
    const evcApproved = await this.prisma.evcPaymentProof.count({
      where: { status: "approved" },
    });
    const evcRejected = await this.prisma.evcPaymentProof.count({
      where: { status: "rejected" },
    });

    const totalCompletedRevenueCents = gateways.reduce(
      (sum, g) => sum + byGateway[g].completedRevenueCents,
      0
    );
    const totalCompletedCount = gateways.reduce(
      (sum, g) => sum + byGateway[g].completedCount,
      0
    );

    return {
      byGateway,
      totals: {
        completedCount: totalCompletedCount,
        completedRevenueCents: totalCompletedRevenueCents,
      },
      evc: {
        pending: evcPending,
        approved: evcApproved,
        rejected: evcRejected,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  /** Unified recent payment + EVC activity for the admin timeline. */
  async activity(opts: {
    gateway?: string;
    limit?: number;
  }) {
    const limit = parseLimit(String(opts.limit ?? 40), 40, 80);
    const paymentWhere: Prisma.PaymentWhereInput = {};
    if (opts.gateway && isPaymentGateway(opts.gateway)) {
      Object.assign(paymentWhere, gatewayWhere(opts.gateway));
    }

    const [payments, evcProofs] = await Promise.all([
      this.prisma.payment.findMany({
        where: paymentWhere,
        orderBy: { paymentCreatedAt: "desc" },
        take: limit,
        include: { user: { select: { email: true } } },
      }),
      opts.gateway === "manual" || !opts.gateway
        ? this.prisma.evcPaymentProof.findMany({
            orderBy: { proofCreatedAt: "desc" },
            take: limit,
            include: {
              user: { select: { email: true } },
              profile: { select: { name: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const userIds = [...new Set(payments.map((p) => p.userId))];
    const profiles = userIds.length
      ? await this.prisma.profile.findMany({
          where: { userId: { in: userIds } },
          select: { userId: true, name: true },
        })
      : [];
    const profileByUser = new Map(profiles.map((p) => [p.userId, p]));

    type ActivityItem = {
      id: string;
      kind: "payment" | "evc_proof";
      action: string;
      gateway: PaymentGateway | "manual";
      status: string;
      amountCents: number;
      userName: string;
      userEmail: string | null;
      at: string;
      detail?: string | null;
    };

    const items: ActivityItem[] = [];

    for (const p of payments) {
      const gateway = inferPaymentGateway(p);
      const profile = profileByUser.get(p.userId);
      items.push({
        id: p.id,
        kind: "payment",
        action:
          p.status === "completed"
            ? "payment_completed"
            : p.status === "pending"
              ? "payment_started"
              : "payment_failed",
        gateway,
        status: p.status,
        amountCents: p.amount,
        userName: profile?.name ?? "Unknown",
        userEmail: maskEmail(p.user.email),
        at: p.paymentCreatedAt.toISOString(),
        detail: p.paymentType,
      });
    }

    for (const proof of evcProofs) {
      items.push({
        id: proof.id,
        kind: "evc_proof",
        action:
          proof.status === "pending"
            ? "evc_submitted"
            : proof.status === "approved"
              ? "evc_approved"
              : "evc_rejected",
        gateway: "manual",
        status: proof.status,
        amountCents: proof.amountCents,
        userName: proof.profile.name,
        userEmail: maskEmail(proof.user.email),
        at: (
          proof.reviewedAt ?? proof.proofCreatedAt
        ).toISOString(),
        detail: proof.rejectionReason,
      });
    }

    items.sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
    );

    return { items: items.slice(0, limit) };
  }

  async listEvcProofs(opts: {
    status?: string;
    cursor?: string;
    limit?: number;
  }) {
    const limit = parseLimit(String(opts.limit ?? 30), 30, 100);
    const where: Prisma.EvcPaymentProofWhereInput = {};
    if (
      opts.status &&
      ["pending", "approved", "rejected"].includes(opts.status)
    ) {
      where.status = opts.status as never;
    }
    if (opts.cursor) where.id = { lt: opts.cursor };

    const rows = await this.prisma.evcPaymentProof.findMany({
      where,
      orderBy: { proofCreatedAt: "desc" },
      take: limit + 1,
      include: {
        user: { select: { email: true } },
        profile: { select: { name: true, phone: true, gender: true, id: true } },
        reviewedBy: { select: { email: true } },
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: page.map((proof) => ({
        _id: proof.id,
        id: proof.id,
        status: proof.status,
        tier: proof.tier,
        amountCents: proof.amountCents,
        payerFullName: proof.payerFullName,
        lastFourDigits: proof.lastFourDigits,
        profileId: proof.profile.id,
        profileName: proof.profile.name,
        gender: proof.profile.gender,
        userPhone: proof.profile.phone,
        userEmail: maskEmail(proof.user.email),
        createdAt: proof.proofCreatedAt.getTime(),
        reviewedAt: proof.reviewedAt?.getTime() ?? null,
        rejectionReason: proof.rejectionReason,
        reviewerEmail: proof.reviewedBy?.email
          ? maskEmail(proof.reviewedBy.email)
          : null,
      })),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    };
  }

  /** Daily completed revenue buckets for charting (default last 30 days). */
  async revenueChart(opts?: { days?: number; from?: string; to?: string }) {
    const days = Math.min(Math.max(opts?.days ?? 30, 7), 90);
    const customRange = parseDateRange(opts?.from, opts?.to);
    const end = customRange?.lte ?? new Date();
    const start =
      customRange?.gte ??
      new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);

    const payments = await this.prisma.payment.findMany({
      where: {
        status: "completed",
        paymentCreatedAt: { gte: start, lte: end },
      },
      select: {
        amount: true,
        paymentCreatedAt: true,
        stripeSessionId: true,
        fulfillmentKey: true,
      },
      orderBy: { paymentCreatedAt: "asc" },
      take: 5000,
    });

    const bucketMap = new Map<
      string,
      {
        stripe: number;
        waafi: number;
        paystack: number;
        manual: number;
        total: number;
      }
    >();
    const emptyDayRow = () => ({
      stripe: 0,
      waafi: 0,
      paystack: 0,
      manual: 0,
      total: 0,
    });

    for (const p of payments) {
      const day = utcDayKey(p.paymentCreatedAt);
      const gateway = inferPaymentGateway(p);
      const row = bucketMap.get(day) ?? emptyDayRow();
      row[gateway] += p.amount;
      row.total += p.amount;
      bucketMap.set(day, row);
    }

    const series: Array<{
      date: string;
      stripeCents: number;
      waafiCents: number;
      paystackCents: number;
      manualCents: number;
      totalCents: number;
    }> = [];

    const cursor = new Date(start);
    cursor.setUTCHours(0, 0, 0, 0);
    const endDay = new Date(end);
    endDay.setUTCHours(0, 0, 0, 0);

    while (cursor.getTime() <= endDay.getTime()) {
      const key = utcDayKey(cursor);
      const row = bucketMap.get(key) ?? emptyDayRow();
      series.push({
        date: key,
        stripeCents: row.stripe,
        waafiCents: row.waafi,
        paystackCents: row.paystack,
        manualCents: row.manual,
        totalCents: row.total,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return { series, from: start.toISOString(), to: end.toISOString() };
  }

  /** CSV export for accounting (max 2000 rows). */
  async exportCsv(opts: {
    status?: string;
    gateway?: string;
    from?: string;
    to?: string;
  }) {
    const result = await this.list({
      ...opts,
      limit: 2000,
      cursor: undefined,
    });
    const header = [
      "date",
      "member",
      "email",
      "gateway",
      "membership",
      "status",
      "amount_usd",
      "payment_type",
      "paid_until",
    ].join(",");
    const lines = [header];
    for (const row of result.items as Array<Record<string, unknown>>) {
      lines.push(
        [
          csvEscape(new Date(Number(row.createdAt)).toISOString()),
          csvEscape(String(row.userName ?? "")),
          csvEscape(String(row.userEmail ?? "")),
          csvEscape(String(row.gateway ?? "")),
          csvEscape(String(row.membershipType ?? "")),
          csvEscape(String(row.status ?? "")),
          csvEscape((Number(row.amount ?? 0) / 100).toFixed(2)),
          csvEscape(String(row.paymentType ?? "")),
          csvEscape(String(row.paidUntil ?? "")),
        ].join(",")
      );
    }
    return lines.join("\n");
  }

  /** Search Waafi payments by reference / session fragment. */
  async waafiLookup(q: string) {
    const term = q.trim();
    if (term.length < 4) {
      throw new BadRequestException("Enter at least 4 characters to search");
    }
    if (term.length > 80) {
      throw new BadRequestException("Search term too long");
    }

    const rows = await this.prisma.payment.findMany({
      where: {
        AND: [
          gatewayWhere("waafi"),
          {
            OR: [
              { stripeSessionId: { contains: term, mode: "insensitive" } },
              { fulfillmentKey: { contains: term, mode: "insensitive" } },
            ],
          },
        ],
      },
      orderBy: { paymentCreatedAt: "desc" },
      take: 25,
      include: { user: { select: { email: true } } },
    });

    const userIds = [...new Set(rows.map((p) => p.userId))];
    const profiles = userIds.length
      ? await this.prisma.profile.findMany({
          where: { userId: { in: userIds } },
          select: {
            userId: true,
            name: true,
            phone: true,
            id: true,
            hasPaid: true,
            paidUntil: true,
          },
        })
      : [];
    const profileByUser = new Map(profiles.map((p) => [p.userId, p]));

    return {
      query: term,
      items: rows.map((p) => mapPaymentRow(p, profileByUser.get(p.userId))),
    };
  }

  /** Paid members with subscription / period status. */
  async listMemberships(opts: { cursor?: string; limit?: number }) {
    const limit = parseLimit(String(opts.limit ?? 50), 50, 100);
    const where: Prisma.ProfileWhereInput = { hasPaid: true };
    if (opts.cursor) where.id = { lt: opts.cursor };

    const profiles = await this.prisma.profile.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: limit + 1,
      select: {
        id: true,
        userId: true,
        name: true,
        phone: true,
        hasPaid: true,
        paidUntil: true,
        approved: true,
        reviewStatus: true,
      },
    });

    const hasMore = profiles.length > limit;
    const page = hasMore ? profiles.slice(0, limit) : profiles;
    const userIds = page.map((p) => p.userId);

    const payments = userIds.length
      ? await this.prisma.payment.findMany({
          where: { userId: { in: userIds }, status: "completed" },
          orderBy: { paymentCreatedAt: "desc" },
          select: {
            userId: true,
            stripeSessionId: true,
            fulfillmentKey: true,
            paymentCreatedAt: true,
          },
        })
      : [];

    const latestGateway = new Map<string, PaymentGateway>();
    for (const pay of payments) {
      if (!latestGateway.has(pay.userId)) {
        latestGateway.set(pay.userId, inferPaymentGateway(pay));
      }
    }

    const items = page.map((profile) => {
      const gateway = latestGateway.get(profile.userId);
      const membershipType = inferMembershipType({
        hasPaid: profile.hasPaid,
        paidUntil: profile.paidUntil,
        gateway,
      });
      const accessActive =
        profile.paidUntil == null ||
        profile.paidUntil.getTime() > Date.now();
      return {
        profileId: profile.id,
        userId: profile.userId,
        name: profile.name,
        phone: profile.phone,
        membershipType,
        gateway: gateway ?? null,
        paidUntil: profile.paidUntil?.toISOString() ?? null,
        accessActive,
        reviewStatus: profile.reviewStatus,
      };
    });

    return {
      items,
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
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
