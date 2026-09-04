import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { hasPaidAccess } from "../common/access";
import { GrantPaidAccessService } from "./grant-paid-access.service";
import {
  getRegistrationCheckoutDetails,
  isMembershipRenewal,
  isPremiumPayment,
  periodicRegistrationChargeCents,
  type RegistrationTier,
} from "./pricing";
import { claimStripeWebhookEvent } from "./stripe-webhook-claim";
import { PaystackClient } from "./paystack.client";

/** `paystack:<reference>` — mirrors the `waafi:` / `evc:` session-key scheme. */
function sessionKeyFor(reference: string): string {
  return `paystack:${reference}`;
}

@Injectable()
export class PaystackPaymentsService {
  private readonly logger = new Logger(PaystackPaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly paystack: PaystackClient,
    private readonly grant: GrantPaidAccessService
  ) {}

  isEnabled(): boolean {
    return this.paystack.isConfigured();
  }

  status() {
    return {
      enabled: this.paystack.isConfigured(),
      configured: this.paystack.configPresence(),
      mode: this.paystack.mode(),
      currency: this.paystack.currency(),
      publicKey: this.paystack.publicKey() || null,
    };
  }

  private appUrl(): string {
    return (
      this.config.get<string>("APP_URL") ?? "http://127.0.0.1:3001"
    ).replace(/\/$/, "");
  }

  /**
   * Start a hosted Paystack checkout for registration / renewal.
   * Basic: $4.99 first time, then $1.00 for each 30-day renewal (mirrors Stripe).
   */
  async startRegistration(opts: {
    userId: string;
    tier?: RegistrationTier;
    /** Restrict the hosted checkout to one channel — "mobile_money" powers the M-Pesa button. */
    channel?: "mobile_money" | "card" | "bank";
  }): Promise<{
    ok: true;
    authorizationUrl: string;
    reference: string;
    amountCents: number;
    tier: RegistrationTier;
    isRenewal: boolean;
  }> {
    if (!this.paystack.isConfigured()) {
      throw new ServiceUnavailableException(
        "Paystack is temporarily unavailable. Please try card or WaafiPay, or try again shortly."
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: opts.userId },
      include: { profile: true },
    });
    if (!user?.profile) {
      throw new BadRequestException("Complete your profile before paying");
    }
    if (hasPaidAccess(user.profile)) {
      throw new BadRequestException("You already have active paid access");
    }
    const email = (user.email ?? "").trim();
    if (!email) {
      throw new BadRequestException(
        "Add an email address to your account before paying with Paystack"
      );
    }

    const tier: RegistrationTier = opts.tier === "premium" ? "premium" : "basic";
    const details = getRegistrationCheckoutDetails(tier, user.profile.gender);
    const isRenewal = isMembershipRenewal(user.profile);
    const amountCents = periodicRegistrationChargeCents({
      tier,
      gender: user.profile.gender,
      isRenewal,
    });

    const reference = `hel-${user.id.replace(/-/g, "").slice(0, 12)}-${Date.now()}`;
    const sessionKey = sessionKeyFor(reference);

    let payment = await this.prisma.payment.findUnique({
      where: { stripeSessionId: sessionKey },
    });
    if (!payment) {
      try {
        payment = await this.prisma.payment.create({
          data: {
            convexId: `local_paystack_pay_${randomUUID()}`,
            userId: user.id,
            convexUserId: user.convexId,
            stripeSessionId: sessionKey,
            amount: amountCents,
            paymentType: details.paymentType,
            registrationTier: details.registrationTier,
            status: "pending",
            paymentCreatedAt: new Date(),
          },
        });
      } catch (err: unknown) {
        const code =
          err && typeof err === "object" && "code" in err
            ? (err as { code?: string }).code
            : undefined;
        if (code !== "P2002") throw err;
        payment = await this.prisma.payment.findUnique({
          where: { stripeSessionId: sessionKey },
        });
      }
    }
    if (!payment) {
      throw new ServiceUnavailableException("Could not create payment");
    }

    const init = await this.paystack.initializeTransaction({
      email,
      // Payment.amount stays in USD cents (canonical); Paystack is charged in
      // the settlement currency (USD unchanged, else via PAYSTACK_USD_RATE).
      amount: this.paystack.chargeAmount(amountCents),
      currency: this.paystack.currency(),
      reference,
      callbackUrl: `${this.appUrl()}/payment/success?paystack_reference=${encodeURIComponent(reference)}`,
      metadata: {
        userId: user.id,
        tier,
        type: "registration",
        isRenewal,
      },
      channels: opts.channel ? [opts.channel] : undefined,
    });

    if (!init.ok) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: "failed" },
      });
      this.logger.warn(
        `Paystack initialize declined user=${user.id} msg=${init.message}`
      );
      throw new BadRequestException(
        "Could not start the Paystack payment. Please try again."
      );
    }

    return {
      ok: true,
      authorizationUrl: init.authorizationUrl,
      reference,
      amountCents,
      tier,
      isRenewal,
    };
  }

  /** Called by the success page after Paystack redirects back. */
  async verifyReference(userId: string, reference: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { stripeSessionId: sessionKeyFor(reference) },
    });
    if (!payment) {
      throw new BadRequestException("Unknown Paystack reference");
    }
    if (payment.userId !== userId) {
      throw new BadRequestException(
        "This payment does not belong to your account"
      );
    }

    const result = await this.fulfillByReference(reference, "verify");
    if (!result.fulfilled) {
      throw new BadRequestException(
        result.reason ?? "Payment not completed yet. Try again in a moment."
      );
    }
    return {
      success: true as const,
      alreadyCompleted: result.alreadyCompleted,
      isPremium: isPremiumPayment(payment),
    };
  }

  async handleWebhook(rawBody: Buffer | string, signature: string | undefined) {
    if (!signature) {
      throw new BadRequestException("Missing x-paystack-signature header");
    }
    if (!this.paystack.verifyWebhookSignature(rawBody, signature)) {
      throw new BadRequestException("Webhook Error: invalid signature");
    }

    let event: { event?: string; data?: Record<string, unknown> };
    try {
      event = JSON.parse(
        typeof rawBody === "string" ? rawBody : rawBody.toString("utf8")
      );
    } catch {
      throw new BadRequestException("Webhook Error: invalid JSON");
    }

    const data = event.data ?? {};
    const reference =
      typeof data.reference === "string" ? data.reference : null;
    const eventType = event.event ?? "unknown";

    if (eventType !== "charge.success" || !reference) {
      // Signed but not actionable — acknowledge so Paystack stops retrying.
      return { received: true, ignored: true };
    }

    const payloadHash = createHash("sha256")
      .update(typeof rawBody === "string" ? Buffer.from(rawBody) : rawBody)
      .digest("hex");
    const eventId = `paystack:${
      typeof data.id === "number" || typeof data.id === "string"
        ? data.id
        : reference
    }`;

    const claim = await claimStripeWebhookEvent(this.prisma, {
      stripeEventId: eventId,
      eventType,
      payloadHash,
    });
    if (claim.outcome === "duplicate_completed") {
      return { received: true, duplicate: true };
    }
    if (claim.outcome === "busy") {
      throw new ServiceUnavailableException(
        "Webhook event is already being processed. Retry later."
      );
    }

    const row = claim.row;
    try {
      await this.fulfillByReference(reference, "webhook");
      await this.prisma.stripeWebhookEvent.update({
        where: { id: row.id },
        data: { status: "completed", processedAt: new Date(), error: null },
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

  /** Verify with Paystack, then grant access. Idempotent via the grant path. */
  private async fulfillByReference(
    reference: string,
    caller: "verify" | "webhook"
  ): Promise<{
    fulfilled: boolean;
    alreadyCompleted: boolean;
    reason?: string;
  }> {
    const payment = await this.prisma.payment.findUnique({
      where: { stripeSessionId: sessionKeyFor(reference) },
    });
    if (!payment) {
      return { fulfilled: false, alreadyCompleted: false, reason: "Unknown reference" };
    }
    if (payment.status === "completed") {
      return { fulfilled: true, alreadyCompleted: true };
    }

    const verified = await this.paystack.verifyTransaction(reference);
    if (!verified.ok) {
      return {
        fulfilled: false,
        alreadyCompleted: false,
        reason: verified.message,
      };
    }
    if (!verified.paid) {
      if (verified.status === "failed" || verified.status === "abandoned") {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: "failed" },
        });
      }
      return {
        fulfilled: false,
        alreadyCompleted: false,
        reason: "Payment not completed",
      };
    }

    // The amount check below only means anything if the paid currency matches
    // what we priced the plan in — a smaller-denomination currency could clear
    // an underpayment otherwise.
    const expectedCurrency = this.paystack.currency();
    if (verified.currency.toUpperCase() !== expectedCurrency) {
      this.logger.warn(
        `Paystack currency mismatch ref=${reference} paid=${verified.currency} expected=${expectedCurrency}`
      );
      return {
        fulfilled: false,
        alreadyCompleted: false,
        reason: "Payment currency did not match",
      };
    }

    const expectedCharge = this.paystack.chargeAmount(payment.amount);
    if (verified.amount < expectedCharge) {
      this.logger.warn(
        `Paystack underpayment ref=${reference} paid=${verified.amount} expected=${expectedCharge}`
      );
      return {
        fulfilled: false,
        alreadyCompleted: false,
        reason: "Payment amount did not match",
      };
    }

    const result = await this.grant.applyPaymentCompletion({
      paymentId: payment.id,
      source: "paystack",
      fulfillmentKey: sessionKeyFor(reference),
      forceProfileApproval: true,
    });
    this.logger.log(
      `Paystack fulfilled ref=${reference} via=${caller} already=${result.alreadyCompleted}`
    );
    return { fulfilled: true, alreadyCompleted: result.alreadyCompleted };
  }
}
