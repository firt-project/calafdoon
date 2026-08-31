import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { isStaffRole } from "../common/access";
import {
  requiresAdminProfileApproval,
  resolveReviewStatus,
} from "../common/review-status";
import { MetricsQueueService } from "../queue/metrics-queue.service";

const EMPTY = {
  totalUsers: 0,
  maleUsers: 0,
  femaleUsers: 0,
  approvedMale: 0,
  approvedFemale: 0,
  approvedTotal: 0,
  paidBasicMembers: 0,
  freeBasicWomen: 0,
  paidPremiumCount: 0,
  unpaidCount: 0,
  trialCount: 0,
  pendingApproval: 0,
  bannedUsers: 0,
  paidMembers: 0,
  memberCount: 0,
  completeMembers: 0,
  trialMembers: 0,
  genderBreakdown: { male: 0, female: 0, unknown: 0 },
  reviewBreakdown: {
    incomplete: 0,
    pending_review: 0,
    approved: 0,
    rejected: 0,
    suspended: 0,
  },
  countryBreakdown: {} as Record<string, number>,
  monthlySignups: {} as Record<string, number>,
};

type Acc = typeof EMPTY;

function emptyAcc(): Acc {
  return {
    ...EMPTY,
    genderBreakdown: { ...EMPTY.genderBreakdown },
    reviewBreakdown: { ...EMPTY.reviewBreakdown },
    countryBreakdown: {},
    monthlySignups: {},
  };
}

function foldProfile(
  acc: Acc,
  p: {
    banned: boolean;
    gender: string | null;
    role: string;
    hasPaid: boolean;
    questionnaireComplete: boolean;
    hasPersonalSupport: boolean | null;
    country: string | null;
    createdAt: Date;
    reviewStatus: string | null;
    approved: boolean | null;
  }
) {
  acc.totalUsers += 1;
  if (p.banned) acc.bannedUsers += 1;
  if (p.gender === "male") acc.maleUsers += 1;
  else if (p.gender === "female") acc.femaleUsers += 1;

  if (isStaffRole(p.role)) return;

  acc.memberCount += 1;
  if (p.hasPaid) acc.paidMembers += 1;
  if (p.questionnaireComplete) acc.completeMembers += 1;

  if (p.gender === "male" || p.gender === "female") {
    acc.genderBreakdown[p.gender] += 1;
  } else {
    acc.genderBreakdown.unknown += 1;
  }

  const review = resolveReviewStatus(p);
  if (review in acc.reviewBreakdown) {
    acc.reviewBreakdown[review as keyof Acc["reviewBreakdown"]] += 1;
  }

  if (review === "approved") {
    acc.approvedTotal += 1;
    if (p.gender === "male") acc.approvedMale += 1;
    if (p.gender === "female") acc.approvedFemale += 1;
  }

  if (p.hasPaid && !p.hasPersonalSupport && p.gender === "male") {
    acc.paidBasicMembers += 1;
  }
  if (p.gender === "female" && p.hasPaid && !p.hasPersonalSupport) {
    acc.freeBasicWomen += 1;
  }
  if (p.hasPersonalSupport) acc.paidPremiumCount += 1;
  if (p.gender === "male" && !p.hasPaid) acc.unpaidCount += 1;

  if (requiresAdminProfileApproval(p)) {
    if (review === "pending_review" || review === "rejected") {
      acc.pendingApproval += 1;
    }
  }

  const country = p.country?.trim() || "Unknown";
  acc.countryBreakdown[country] = (acc.countryBreakdown[country] ?? 0) + 1;

  const month = p.createdAt.toISOString().slice(0, 7);
  acc.monthlySignups[month] = (acc.monthlySignups[month] ?? 0) + 1;
}

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => MetricsQueueService))
    private readonly queue: MetricsQueueService
  ) {}

  async getGlobal() {
    return this.prisma.siteMetrics.findUnique({ where: { key: "global" } });
  }

  async scheduleRebuild() {
    const existing = await this.getGlobal();
    const now = Date.now();
    if (
      existing?.rebuildScheduledAt &&
      now - existing.rebuildScheduledAt.getTime() < 2 * 60 * 1000
    ) {
      return;
    }

    if (existing) {
      await this.prisma.siteMetrics.update({
        where: { id: existing.id },
        data: { rebuildScheduledAt: new Date() },
      });
    } else {
      await this.prisma.siteMetrics.create({
        data: {
          convexId: `local_metrics_${Date.now()}`,
          key: "global",
          ...emptyAcc(),
          metricsUpdatedAt: new Date(0),
          rebuildScheduledAt: new Date(),
          genderBreakdown: emptyAcc().genderBreakdown,
          reviewBreakdown: emptyAcc().reviewBreakdown,
          countryBreakdown: {},
          monthlySignups: {},
        },
      });
    }

    await this.queue.enqueueRebuild();
  }

  /** Batched rebuild port of convex/siteMetrics.ts */
  async rebuildFromStart() {
    const PAGE = 100;
    let cursor: string | undefined;
    const acc = emptyAcc();

    for (;;) {
      const page = await this.prisma.profile.findMany({
        orderBy: { id: "asc" },
        take: PAGE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        select: {
          id: true,
          banned: true,
          gender: true,
          role: true,
          hasPaid: true,
          questionnaireComplete: true,
          hasPersonalSupport: true,
          country: true,
          createdAt: true,
          reviewStatus: true,
          approved: true,
        },
      });
      if (page.length === 0) break;
      for (const p of page) foldProfile(acc, p);
      cursor = page[page.length - 1]!.id;
      if (page.length < PAGE) break;
    }

    const payload = {
      ...acc,
      trialCount: 0,
      trialMembers: 0,
      metricsUpdatedAt: new Date(),
      rebuildScheduledAt: null as Date | null,
      genderBreakdown: acc.genderBreakdown as Prisma.InputJsonValue,
      reviewBreakdown: acc.reviewBreakdown as Prisma.InputJsonValue,
      countryBreakdown: acc.countryBreakdown as Prisma.InputJsonValue,
      monthlySignups: acc.monthlySignups as Prisma.InputJsonValue,
    };

    const existing = await this.getGlobal();
    if (existing) {
      await this.prisma.siteMetrics.update({
        where: { id: existing.id },
        data: payload,
      });
    } else {
      await this.prisma.siteMetrics.create({
        data: {
          convexId: `local_metrics_${Date.now()}`,
          key: "global",
          ...payload,
        },
      });
    }

    this.logger.log("Site metrics rebuild complete");
    return payload;
  }
}
