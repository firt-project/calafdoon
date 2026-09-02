import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomUUID } from "node:crypto";
import { Inject } from "@nestjs/common";
import { isPremiumMember, hasPaidAccess } from "../common/access";
import { computeAccessState } from "../common/access-state";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.module";
import { GrantPaidAccessService } from "./grant-paid-access.service";
import {
  getRegistrationCheckoutDetails,
  PENDING_MAX_AGE_MS,
  PREMIUM_UPGRADE_AMOUNT_CENTS,
  type RegistrationTier,
} from "./pricing";
import {
  amountFallbackFromMetadata,
  STRIPE_GATEWAY,
  type StripeGateway,
} from "./stripe.gateway";
import {
  PaymentReconcileQueueService,
  type PaymentReconcileJob,
} from "../queue/payment-email-queue.service";
import { claimStripeWebhookEvent } from "./stripe-webhook-claim";

@Injectable()
export class PaymentsService implements OnModuleInit {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly grant: GrantPaidAccessService,
    private readonly reconcileQueue: PaymentReconcileQueueService,
    @Inject(STRIPE_GATEWAY) private readonly stripe: StripeGateway
  ) {}

  onModuleInit() {
    this.reconcileQueue.setProcessor((job) => this.runReconcileJob(job));
  }

  private async failClosedRate(bucket: string, userId: string) {
    const online = await this.redis.connect();
    if (!online || !this.redis.client) {
      throw new ServiceUnavailableException(
        "Service temporarily unavailable. Try again later."
      );
    }
    const limits: Record<string, { windowSec: number; max: number }> = {
      "payments.checkout": { windowSec: 60, max: 10 },
      "payments.verify": { windowSec: 60, max: 30 },
      "payments.evc": { windowSec: 60, max: 20 },
      "payments.webhook": { windowSec: 60, max: 120 },
    };
    const spec = limits[bucket];
    if (!spec) return;
    const key = `rl:${bucket}:user:${userId}`;
    const count = await this.redis.client.incr(key);
    if (count === 1) await this.redis.client.expire(key, spec.windowSec);
    if (count > spec.max) {
      throw new ServiceUnavailableException("Too many requests. Try again later.");
    }
  }

  private appUrl() {
    return (
      this.config.get<string>("APP_URL") ?? "http://127.0.0.1:3001"
    ).replace(/\/$/, "");
  }

  async createRegistrationCheckout(userId: string, tier: RegistrationTier) {
    await this.failClosedRate("payments.checkout", userId);
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) throw new ForbiddenException("Profile not found");
    if (profile.banned) throw new ForbiddenException("Account suspended");
    if (isPremiumMember(profile)) {
      throw new BadRequestException("Already on the premium plan");
    }
    if (hasPaidAccess(profile)) {
      if (tier === "basic") throw new BadRequestException("Already paid");
      throw new BadRequestException("Use the Premium upgrade button");
    }

    const checkout = getRegistrationCheckoutDetails(tier, profile.gender);
    const isBasicSubscription =
      tier === "basic" &&
      typeof checkout.monthlyAmountCents === "number" &&
      typeof checkout.setupAmountCents === "number";

    const session = await this.stripe.createCheckoutSession({
      amountCents: checkout.amount,
      productName: checkout.productName,
      productDescription: checkout.productDescription,
      successUrl: `${this.appUrl()}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${this.appUrl()}/payment?canceled=true`,
      metadata: {
        userId,
        type: checkout.metadataType,
        tier: checkout.registrationTier,
        ...(isBasicSubscription
          ? {
              billing: "subscription",
              monthlyCents: String(checkout.monthlyAmountCents),
            }
          : {}),
      },
      ...(isBasicSubscription
        ? {
            subscription: {
              monthlyCents: checkout.monthlyAmountCents!,
              setupCents: checkout.setupAmountCents!,
              monthlyProductName: "Web Monthly Membership",
              setupProductName: "Web First Payment",
            },
          }
        : {}),
    });

    if (!session.url) {
      throw new BadRequestException("Failed to create Stripe checkout session");
    }

    await this.recordPendingPayment({
      userId,
      stripeSessionId: session.id,
      amount: checkout.amount,
      paymentType: checkout.paymentType,
      registrationTier: checkout.registrationTier,
    });

    return { url: session.url, sessionId: session.id, amount: checkout.amount };
  }

  async createPremiumUpgradeCheckout(userId: string) {
    await this.failClosedRate("payments.checkout", userId);
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) throw new ForbiddenException("Profile not found");
    if (profile.banned) throw new ForbiddenException("Account suspended");
    if (!hasPaidAccess(profile)) {
      throw new BadRequestException(
        "Complete basic registration before upgrading"
      );
    }
    if (isPremiumMember(profile)) {
      throw new BadRequestException("Already on the premium plan");
    }

    const amount = PREMIUM_UPGRADE_AMOUNT_CENTS;
    const session = await this.stripe.createCheckoutSession({
      amountCents: amount,
      productName: "Web Premium",
      productDescription:
        "WhatsApp personal support and help finding your match — same app features as Basic",
      successUrl: `${this.appUrl()}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${this.appUrl()}/profile?upgrade_canceled=true`,
      metadata: {
        userId,
        type: "premium_upgrade",
        tier: "premium",
      },
    });

    if (!session.url) {
      throw new BadRequestException("Failed to create Stripe checkout session");
    }

    await this.recordPendingPayment({
      userId,
      stripeSessionId: session.id,
      amount,
      paymentType: "premium_upgrade",
      registrationTier: "premium",
    });

    return { url: session.url, sessionId: session.id, amount };
  }

  async recordPendingPayment(args: {
    userId: string;
    stripeSessionId: string;
    amount: number;
    paymentType: "registration" | "registration_premium" | "premium_upgrade" | "chat";
    registrationTier?: "basic" | "premium";
    matchId?: string;
  }) {
    const existing = await this.prisma.payment.findUnique({
      where: { stripeSessionId: args.stripeSessionId },
    });
    if (existing) return existing;

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: args.userId },
    });

    return this.prisma.payment.create({
      data: {
        convexId: `local_pay_${randomUUID()}`,
        userId: args.userId,
        convexUserId: user.convexId,
        stripeSessionId: args.stripeSessionId,
        amount: args.amount,
        paymentType: args.paymentType,
        registrationTier: args.registrationTier,
        matchId: args.matchId,
        status: "pending",
        paymentCreatedAt: new Date(),
      },
    });
  }

  async verifySession(userId: string, sessionId: string) {
    await this.failClosedRate("payments.verify", userId);
    const session = await this.stripe.retrieveSession(sessionId);
    if (session.payment_status !== "paid") {
      throw new BadRequestException("Payment not completed");
    }
    if (session.metadata?.userId !== userId) {
      throw new ForbiddenException(
        "Payment session does not belong to this account"
      );
    }
    return this.fulfillFromSession(session);
  }

  async fulfillFromSession(session: {
    id: string;
    payment_status: string;
    amount_total: number | null;
    metadata: Record<string, string> | null;
  }) {
    if (session.payment_status !== "paid") {
      return { success: false as const, alreadyCompleted: false };
    }
    const userId = session.metadata?.userId;
    if (!userId) throw new BadRequestException("Missing userId metadata");

    const isChat = session.metadata?.type === "chat";
    const isUpgrade = session.metadata?.type === "premium_upgrade";
    const isPremium = session.metadata?.tier === "premium" || isUpgrade;
    const paymentType = isChat
      ? ("chat" as const)
      : isUpgrade
        ? ("premium_upgrade" as const)
        : isPremium
          ? ("registration_premium" as const)
          : ("registration" as const);
    const amount =
      session.amount_total ??
      amountFallbackFromMetadata(session.metadata ?? {});

    let payment = await this.prisma.payment.findUnique({
      where: { stripeSessionId: session.id },
    });
    if (!payment) {
      payment = await this.recordPendingPayment({
        userId,
        stripeSessionId: session.id,
        amount,
        paymentType,
        registrationTier: isChat ? undefined : isPremium ? "premium" : "basic",
        matchId: session.metadata?.matchId,
      });
    }
    if (payment.userId !== userId) {
      throw new ForbiddenException("Payment does not belong to user");
    }

    const result = await this.grant.applyPaymentCompletion({
      paymentId: payment.id,
      source: "stripe",
      fulfillmentKey: `stripe:${session.id}`,
      matchId: session.metadata?.matchId,
    });

    return {
      success: true as const,
      alreadyCompleted: result.alreadyCompleted,
      isPremium: !isChat && isPremium,
    };
  }

  async handleWebhook(rawBody: Buffer | string, signature: string | undefined) {
    if (!signature) {
      throw new BadRequestException("Missing stripe-signature header");
    }
    const online = await this.redis.connect();
    if (!online || !this.redis.client) {
      throw new ServiceUnavailableException(
        "Service temporarily unavailable. Try again later."
      );
    }

    let event: { id: string; type: string; data: { object: unknown } };
    try {
      event = this.stripe.constructEvent(rawBody, signature) as typeof event;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid signature";
      throw new BadRequestException(`Webhook Error: ${message}`);
    }

    const payloadHash = createHash("sha256")
      .update(typeof rawBody === "string" ? rawBody : rawBody)
      .digest("hex");

    // M6: durable atomic claim via UNIQUE(stripe_event_id) — never find-then-create.
    const claim = await claimStripeWebhookEvent(this.prisma, {
      stripeEventId: event.id,
      eventType: event.type,
      payloadHash,
    });

    if (claim.outcome === "duplicate_completed") {
      return { received: true, duplicate: true };
    }
    if (claim.outcome === "busy") {
      // Another instance owns a fresh processing claim — ask Stripe to retry.
      throw new ServiceUnavailableException(
        "Webhook event is already being processed. Retry later."
      );
    }

    const row = claim.row;

    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object as {
          id: string;
          payment_status: string;
          amount_total: number | null;
          metadata: Record<string, string> | null;
        };
        await this.fulfillFromSession(session);
      } else if (event.type === "checkout.session.expired") {
        const session = event.data.object as { id: string };
        await this.expireSession(session.id);
      }
      // Unknown signed types: record completed with no business effects so Stripe
      // does not retry forever.

      await this.prisma.stripeWebhookEvent.update({
        where: { id: row.id },
        data: {
          status: "completed",
          processedAt: new Date(),
          error: null,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "processing failed";
      await this.prisma.stripeWebhookEvent.update({
        where: { id: row.id },
        data: {
          status: "failed",
          error: message.slice(0, 500),
          retryCount: { increment: 1 },
        },
      });
      throw err;
    }

    return { received: true, duplicate: false };
  }

  async expireSession(stripeSessionId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { stripeSessionId },
    });
    if (!payment || payment.status !== "pending") {
      return { updated: false };
    }
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: "failed" },
    });
    return { updated: true };
  }

  async getStatus(userId: string) {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException("Profile not found");

    const latestStripe = await this.prisma.payment.findFirst({
      where: {
        userId,
        NOT: { stripeSessionId: { startsWith: "evc:" } },
      },
      orderBy: { paymentCreatedAt: "desc" },
    });
    const latestEvc = await this.prisma.evcPaymentProof.findFirst({
      where: { userId },
      orderBy: { proofCreatedAt: "desc" },
    });
    const pendingPayment =
      latestStripe?.status === "pending" || latestEvc?.status === "pending";

    const access = computeAccessState({
      authenticated: true,
      profile,
    });

    return {
      hasPaid: profile.hasPaid,
      hasPaidAccess: access.hasPaidAccess,
      paymentPending: pendingPayment,
      registrationTier:
        latestStripe?.registrationTier ??
        (profile.hasPersonalSupport ? "premium" : profile.hasPaid ? "basic" : null),
      premiumStatus: isPremiumMember(profile),
      hasPersonalSupport: !!profile.hasPersonalSupport,
      reviewStatus: access.reviewStatus,
      approved: profile.approved,
      nextRoute: access.nextRoute,
      latestStripePayment: latestStripe
        ? {
            id: latestStripe.id,
            status: latestStripe.status,
            amount: latestStripe.amount,
            paymentType: latestStripe.paymentType,
            registrationTier: latestStripe.registrationTier,
            createdAt: latestStripe.paymentCreatedAt.toISOString(),
          }
        : null,
      latestEvcProof: latestEvc
        ? {
            id: latestEvc.id,
            status: latestEvc.status,
            tier: latestEvc.tier,
            amountCents: latestEvc.amountCents,
            createdAt: latestEvc.proofCreatedAt.toISOString(),
            rejectionReason: latestEvc.rejectionReason,
          }
        : null,
    };
  }

  /** Port of reconcileAbandonedPayments — paginated, no full unbounded collect. */
  async reconcileAbandonedPayments(pageSize = 100): Promise<{ updated: number }> {
    let updated = 0;
    let cursor: string | undefined;

    // Mark pending as failed when the member already has *active* paid access
    // (not merely a past completed payment — Waafi/EVC renewals need a new pending).
    for (;;) {
      const pending = await this.prisma.payment.findMany({
        where: { status: "pending" },
        orderBy: { id: "asc" },
        take: pageSize,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        select: { id: true, userId: true, paymentCreatedAt: true },
      });
      if (!pending.length) break;
      cursor = pending[pending.length - 1]!.id;

      const userIds = [...new Set(pending.map((p) => p.userId))];
      const profiles = await this.prisma.profile.findMany({
        where: { userId: { in: userIds } },
        select: {
          userId: true,
          hasPaid: true,
          paidUntil: true,
          role: true,
        },
      });
      const activeAccess = new Set(
        profiles.filter((p) => hasPaidAccess(p)).map((p) => p.userId)
      );

      for (const p of pending) {
        if (activeAccess.has(p.userId)) {
          await this.prisma.payment.update({
            where: { id: p.id },
            data: { status: "failed" },
          });
          updated++;
        }
      }
      if (pending.length < pageSize) break;
    }

    // Keep newest pending per user; expire >24h.
    const now = Date.now();
    const users = await this.prisma.payment.findMany({
      where: { status: "pending" },
      select: { userId: true },
      distinct: ["userId"],
      take: 500,
    });

    for (const { userId } of users) {
      const pendingList = await this.prisma.payment.findMany({
        where: { userId, status: "pending" },
        orderBy: { paymentCreatedAt: "desc" },
        take: 20,
      });
      for (const stale of pendingList.slice(1)) {
        await this.prisma.payment.update({
          where: { id: stale.id },
          data: { status: "failed" },
        });
        updated++;
      }
      const newest = pendingList[0];
      if (
        newest &&
        now - newest.paymentCreatedAt.getTime() > PENDING_MAX_AGE_MS
      ) {
        await this.prisma.payment.update({
          where: { id: newest.id },
          data: { status: "failed" },
        });
        updated++;
      }
    }

    this.logger.log(JSON.stringify({ event: "payment_reconcile", updated }));
    return { updated };
  }

  private async runReconcileJob(job: PaymentReconcileJob) {
    if (job.kind === "abandoned") {
      await this.reconcileAbandonedPayments();
    }
  }
}
