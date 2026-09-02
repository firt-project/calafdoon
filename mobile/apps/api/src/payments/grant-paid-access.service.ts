import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Payment, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ScoreRecalcStub } from "../profile/score-recalc.stub";
import { ChatRealtimeService } from "../chat/chat-realtime.service";
import { PaymentMailService } from "../mail/payment-mail.service";
import { isPremiumPayment, nextMembershipPaidUntil } from "./pricing";

export type GrantSource = "stripe" | "evc" | "waafi" | "paystack";

/**
 * Waafi / Paystack / EVC use a 30-day paidUntil lock; Stripe subscriptions
 * leave it null (Stripe manages recurring access itself).
 */
function isPeriodLockedSource(source: GrantSource): boolean {
  return source === "waafi" || source === "evc" || source === "paystack";
}

/**
 * Port of convex/lib/grantPaidAccess.ts + payments.applyPaymentCompletion.
 * Shared by Stripe webhook/verify and EVC approve.
 */
@Injectable()
export class GrantPaidAccessService {
  private readonly logger = new Logger(GrantPaidAccessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scores: ScoreRecalcStub,
    private readonly realtime: ChatRealtimeService,
    private readonly mail: PaymentMailService
  ) {}

  async supersedeOtherPendingPayments(
    tx: Prisma.TransactionClient,
    userId: string,
    completedPaymentId: string
  ) {
    await tx.payment.updateMany({
      where: {
        userId,
        status: "pending",
        id: { not: completedPaymentId },
      },
      data: { status: "failed" },
    });
  }

  /** Stripe does not use screenshots — close any leftover EVC proof queue rows. */
  async supersedePendingEvcProofs(
    tx: Prisma.TransactionClient,
    userId: string,
    reason: string
  ) {
    await tx.evcPaymentProof.updateMany({
      where: { userId, status: "pending" },
      data: {
        status: "rejected",
        reviewedAt: new Date(),
        rejectionReason: reason,
      },
    });
  }

  /**
   * Unlock paid membership — exact Convex rules:
   * - hasPaid + genderLocked always
   * - premium → hasPersonalSupport
   * - premium OR male → approved + reviewStatus approved
   * - female basic → pending_review, approved false
   */
  async grantProfileAccess(
    tx: Prisma.TransactionClient,
    args: {
      userId: string;
      isPremium: boolean;
      isUpgrade?: boolean;
      notify?: boolean;
      sourceKey: string;
      paymentId: string;
      source: GrantSource;
      /** When true (admin EVC approve), member is fully approved immediately. */
      forceProfileApproval?: boolean;
    }
  ): Promise<{ notified: boolean }> {
    const profile = await tx.profile.findUnique({
      where: { userId: args.userId },
    });
    if (!profile) return { notified: false };

    const fullyApproved =
      args.forceProfileApproval === true ||
      args.isPremium ||
      profile.gender === "male";

    const paidUntil = isPeriodLockedSource(args.source)
      ? nextMembershipPaidUntil(profile.paidUntil)
      : undefined;
    const isRenewal =
      isPeriodLockedSource(args.source) &&
      profile.hasPaid === true &&
      (profile.paidUntil == null ||
        profile.paidUntil.getTime() <= Date.now());

    await tx.profile.update({
      where: { id: profile.id },
      data: {
        hasPaid: true,
        genderLocked: true,
        ...(paidUntil ? { paidUntil } : {}),
        ...(args.isPremium ? { hasPersonalSupport: true } : {}),
        ...(fullyApproved
          ? {
              approved: true,
              reviewStatus: "approved" as const,
              approvedAt: new Date(),
              statusChangedAt: new Date(),
            }
          : {
              approved: false,
              reviewStatus: "pending_review" as const,
              statusChangedAt: new Date(),
            }),
      },
    });

    await tx.profileAuditEvent.create({
      data: {
        userId: args.userId,
        profileId: profile.id,
        action: "profile_update",
        metadata: {
          event: "grant_paid_access",
          isPremium: args.isPremium,
          isUpgrade: !!args.isUpgrade,
          isRenewal,
          source: args.source,
          sourceKey: args.sourceKey,
          paymentId: args.paymentId,
          ...(paidUntil ? { paidUntil: paidUntil.toISOString() } : {}),
        },
      },
    });

    if (args.notify === false) return { notified: false };

    const body = args.isPremium
      ? args.isUpgrade
        ? "Your premium plan is active. WhatsApp support and match-search help are ready."
        : "Your registration and personal support plan are active. Browse matches from your dashboard."
      : isRenewal
        ? "Your membership is renewed for another 30 days. Browse matches from your dashboard."
        : fullyApproved
          ? "Your registration is complete. Browse matches from your dashboard."
          : "Payment received. An admin will review your profile shortly — you will be notified when matches unlock.";

    const notifSource = `payment:${args.sourceKey}`;
    let notification = null;
    try {
      notification = await tx.notification.create({
        data: {
          convexId: `local_notif_${randomUUID()}`,
          userId: args.userId,
          convexUserId: profile.convexUserId,
          type: "payment",
          title: "Payment successful",
          body,
          read: false,
          sourceKey: notifSource,
          notificationCreatedAt: new Date(),
        },
      });
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? (err as { code?: string }).code
          : undefined;
      if (code !== "P2002") throw err;
    }

    return { notified: !!notification, notificationId: notification?.id } as {
      notified: boolean;
      notificationId?: string;
    };
  }

  async unlockChats(tx: Prisma.TransactionClient, userId: string) {
    await tx.match.updateMany({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
        chatUnlocked: false,
      },
      data: { chatUnlocked: true },
    });
  }

  /**
   * Complete a payment row and grant access. Idempotent on payment.status === completed
   * and on fulfillmentKey uniqueness.
   */
  async applyPaymentCompletion(args: {
    paymentId: string;
    source: GrantSource;
    fulfillmentKey: string;
    matchId?: string | null;
    notify?: boolean;
    forceProfileApproval?: boolean;
  }): Promise<{ alreadyCompleted: boolean; payment: Payment }> {
    const result = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: args.paymentId },
      });
      if (!payment) throw new Error("Payment not found");

      if (payment.status === "completed") {
        return { alreadyCompleted: true as const, payment, sideEffects: null };
      }

      const existingKey = await tx.payment.findUnique({
        where: { fulfillmentKey: args.fulfillmentKey },
      });
      if (existingKey && existingKey.id !== payment.id) {
        throw new Error("Fulfillment key already used");
      }

      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "completed",
          fulfilledAt: new Date(),
          fulfillmentKey: args.fulfillmentKey,
        },
      });

      await this.supersedeOtherPendingPayments(tx, payment.userId, payment.id);

      // Instant gateways never need a screenshot. Clear any pending EVC proofs.
      if (
        args.source === "stripe" ||
        args.source === "waafi" ||
        args.source === "paystack"
      ) {
        const proofClearedReason =
          args.source === "waafi"
            ? "Paid via WaafiPay — payment proof not required."
            : args.source === "paystack"
              ? "Paid via Paystack — payment proof not required."
              : "Paid via Stripe — payment proof not required.";
        await this.supersedePendingEvcProofs(
          tx,
          payment.userId,
          proofClearedReason
        );
      }

      const isPremium = isPremiumPayment(payment);
      const isUpgrade = payment.paymentType === "premium_upgrade";
      const shouldNotify =
        args.notify !== false &&
        (payment.paymentType === "registration" ||
          payment.paymentType === "registration_premium" ||
          payment.paymentType === "premium_upgrade" ||
          payment.paymentType === null ||
          payment.paymentType === undefined);

      // Stripe / WaafiPay / Paystack are verified by the gateway — no admin
      // payment proof wait.
      const forceProfileApproval =
        args.forceProfileApproval === true ||
        args.source === "stripe" ||
        args.source === "waafi" ||
        args.source === "paystack";

      const grant = await this.grantProfileAccess(tx, {
        userId: payment.userId,
        isPremium,
        isUpgrade,
        notify: shouldNotify,
        sourceKey: args.fulfillmentKey,
        paymentId: payment.id,
        source: args.source,
        forceProfileApproval,
      });

      const planType =
        payment.paymentType === "registration" ||
        payment.paymentType === "registration_premium" ||
        payment.paymentType === "premium_upgrade" ||
        payment.paymentType == null;

      if (planType) {
        await this.unlockChats(tx, payment.userId);
      } else if (args.matchId) {
        await tx.match.update({
          where: { id: args.matchId },
          data: { chatUnlocked: true },
        });
      }

      return {
        alreadyCompleted: false as const,
        payment: updated,
        sideEffects: {
          userId: payment.userId,
          isPremium,
          isUpgrade,
          shouldNotify,
          notificationId: (grant as { notificationId?: string }).notificationId,
          grantBody: true,
        },
      };
    });

    if (!result.alreadyCompleted && result.sideEffects) {
      const { userId, isPremium, isUpgrade, shouldNotify, notificationId } =
        result.sideEffects;
      try {
        const profile = await this.prisma.profile.findUnique({
          where: { userId },
        });
        if (profile?.questionnaireComplete) {
          await this.scores.enqueue(userId, "payment_completed");
        }
        if (shouldNotify && notificationId) {
          const n = await this.prisma.notification.findUnique({
            where: { id: notificationId },
          });
          if (n) {
            this.realtime.emitToUser(userId, "notification:new", {
              id: n.id,
              type: n.type,
              title: n.title,
              body: n.body,
              read: n.read,
              createdAt: n.notificationCreatedAt.toISOString(),
            });
            await this.mail.queuePaymentSuccess({
              userId,
              paymentId: result.payment.id,
              isPremium,
              isUpgrade,
              gender: profile?.gender ?? "male",
              title: n.title,
              body: n.body,
              profileApproved:
                profile?.approved === true ||
                profile?.reviewStatus === "approved",
            });
          }
        }
      } catch (err) {
        this.logger.warn(
          `Post-fulfillment side effects failed: ${err instanceof Error ? err.message : "unknown"}`
        );
      }
    }

    return {
      alreadyCompleted: result.alreadyCompleted,
      payment: result.payment,
    };
  }
}
