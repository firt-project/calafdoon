import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MetricsService } from "./metrics.service";

@Injectable()
export class AdminStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService
  ) {}

  async getStats() {
    const m = await this.metrics.getGlobal();
    const completedPayments = await this.prisma.payment.findMany({
      where: { status: "completed" },
      select: { amount: true, registrationTier: true, paymentType: true },
      take: 2000,
    });

    let basicPaidCount = 0;
    let basicRevenueCents = 0;
    let premiumSignupCount = 0;
    let premiumSignupRevenueCents = 0;
    let premiumUpgradeCount = 0;
    let premiumUpgradeRevenueCents = 0;
    let otherRevenueCents = 0;

    for (const payment of completedPayments) {
      const amount = payment.amount ?? 0;
      const type = payment.paymentType;
      if (
        type === "registration" ||
        (type == null && payment.registrationTier === "basic")
      ) {
        basicPaidCount++;
        basicRevenueCents += amount;
      } else if (type === "registration_premium") {
        premiumSignupCount++;
        premiumSignupRevenueCents += amount;
      } else if (type === "premium_upgrade") {
        premiumUpgradeCount++;
        premiumUpgradeRevenueCents += amount;
      } else if (type === "chat") {
        otherRevenueCents += amount;
      } else if (payment.registrationTier === "premium") {
        premiumSignupCount++;
        premiumSignupRevenueCents += amount;
      } else if (amount >= 1500) {
        premiumSignupCount++;
        premiumSignupRevenueCents += amount;
      } else if (amount >= 400) {
        basicPaidCount++;
        basicRevenueCents += amount;
      } else {
        otherRevenueCents += amount;
      }
    }

    const premiumPaidCount = premiumSignupCount + premiumUpgradeCount;
    const premiumRevenueCents =
      premiumSignupRevenueCents + premiumUpgradeRevenueCents;
    const revenue =
      basicRevenueCents + premiumRevenueCents + otherRevenueCents;

    const [activeMatches, totalMessages] = await Promise.all([
      this.prisma.match.count({ where: { status: "active" } }),
      this.prisma.message.count(),
    ]);

    const stale =
      !m ||
      Date.now() - m.metricsUpdatedAt.getTime() > 30 * 60 * 1000;

    // Flat Convex-shaped payload so the admin dashboard can render without
    // an extra frontend adapter layer.
    return {
      totalUsers: m?.totalUsers ?? 0,
      maleUsers: m?.maleUsers ?? 0,
      femaleUsers: m?.femaleUsers ?? 0,
      approvedMale: m?.approvedMale ?? 0,
      approvedFemale: m?.approvedFemale ?? 0,
      approvedTotal: m?.approvedTotal ?? 0,
      totalMatches: activeMatches,
      totalMessages,
      revenue,
      paidBasicCount: basicPaidCount,
      paidPremiumCount: m?.paidPremiumCount ?? 0,
      unpaidCount: m?.unpaidCount ?? 0,
      trialCount: 0,
      freeBasicWomen: m?.freeBasicWomen ?? 0,
      // Profile-flag count (paid basic men). Dashboard "Basic ($5)" uses money.basicPaidCount.
      paidBasicMembers: m?.paidBasicMembers ?? 0,
      pendingApproval: m?.pendingApproval ?? 0,
      bannedUsers: m?.bannedUsers ?? 0,
      metricsStale: stale,
      metricsUpdatedAt: m?.metricsUpdatedAt.toISOString() ?? null,
      isOwner: true,
      money: {
        basicPaidCount,
        basicRevenueCents,
        basicPriceCents: 500,
        premiumSignupCount,
        premiumSignupRevenueCents,
        premiumSignupPriceCents: 2000,
        premiumUpgradeCount,
        premiumUpgradeRevenueCents,
        premiumUpgradePriceCents: 1500,
        premiumPaidCount,
        premiumRevenueCents,
        otherRevenueCents,
        totalPaidCount: basicPaidCount + premiumPaidCount,
        totalRevenueCents: revenue,
      },
    };
  }

  async getAnalytics() {
    const m = await this.metrics.getGlobal();
    const paidMembers = m?.paidMembers ?? 0;
    const memberCount = m?.memberCount ?? 0;
    const completeMembers = m?.completeMembers ?? 0;
    return {
      countryBreakdown: (m?.countryBreakdown as Record<string, number>) ?? {},
      monthlySignups: (m?.monthlySignups as Record<string, number>) ?? {},
      genderBreakdown: (m?.genderBreakdown as Record<string, number>) ?? {
        male: 0,
        female: 0,
        unknown: 0,
      },
      reviewBreakdown: (m?.reviewBreakdown as Record<string, number>) ?? {
        incomplete: 0,
        pending_review: 0,
        approved: 0,
        rejected: 0,
        suspended: 0,
      },
      trialMembers: 0,
      paidMembers,
      memberCount,
      matchRate:
        memberCount > 0
          ? Math.round((completeMembers / memberCount) * 100)
          : 0,
      conversionRate:
        memberCount > 0 ? Math.round((paidMembers / memberCount) * 100) : 0,
      metricsUpdatedAt: m?.metricsUpdatedAt.toISOString() ?? null,
    };
  }

  async getActivity(limit = 40) {
    const logs = await this.prisma.auditLog.findMany({
      orderBy: { loggedAt: "desc" },
      take: Math.min(limit, 100),
      include: {
        actor: { include: { profile: { select: { name: true } } } },
      },
    });
    return logs.map((l) => ({
      id: l.id,
      _id: l.id,
      action: l.action,
      actorName: l.actor.profile?.name ?? "Staff",
      createdAt: l.loggedAt.toISOString(),
      metadata: l.metadata,
    }));
  }
}
