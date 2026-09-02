import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { MAIL_ADAPTER } from "../auth/auth.service";
import type { MailAdapter } from "../auth/mail.adapter";
import { PaymentEmailQueueService } from "../queue/payment-email-queue.service";
import { escapeHtml } from "./html-escape";

export type PaymentMailTemplate =
  | "payment_success"
  | "payment_pending_review"
  | "evc_submitted"
  | "evc_approved"
  | "evc_rejected"
  | "premium_upgrade"
  | "password_reset"
  | "admin_evc_alert";

@Injectable()
export class PaymentMailService {
  private readonly logger = new Logger(PaymentMailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly queue: PaymentEmailQueueService,
    @Inject(MAIL_ADAPTER) private readonly mail: MailAdapter
  ) {}

  hashEmail(email: string): string {
    return createHash("sha256").update(email.toLowerCase().trim()).digest("hex");
  }

  async queuePaymentSuccess(opts: {
    userId: string;
    paymentId: string;
    isPremium: boolean;
    isUpgrade: boolean;
    gender: string;
    title: string;
    body: string;
    /** When true (Stripe / force approve), never use pending-review template. */
    profileApproved?: boolean;
  }) {
    const template: PaymentMailTemplate =
      opts.isUpgrade || opts.isPremium
        ? opts.isUpgrade
          ? "premium_upgrade"
          : "payment_success"
        : opts.profileApproved === true || opts.gender !== "female"
          ? "payment_success"
          : "payment_pending_review";

    await this.enqueue({
      userId: opts.userId,
      idempotencyKey: `mail:payment:${opts.paymentId}`,
      template,
      subject: opts.title,
      text: opts.body,
    });
  }

  async queueEvcSubmitted(userId: string, proofId: string) {
    await this.enqueue({
      userId,
      idempotencyKey: `mail:evc_submitted:${proofId}`,
      template: "evc_submitted",
      subject: "EVC payment received",
      text: "We received your EVC payment proof. An admin will review it shortly.",
    });
  }

  /** Notify staff when a member submits manual EVC proof (admin inbox alert). */
  async queueAdminEvcAlert(opts: {
    proofId: string;
    memberName: string;
    amountCents: number;
  }) {
    const recipients = await this.resolveAdminAlertEmails();
    if (!recipients.length) {
      this.logger.warn(
        `No admin alert recipients — skip EVC alert ${opts.proofId}`
      );
      return;
    }

    const appUrl = (
      this.config.get<string>("APP_URL") ?? "https://web.example.com"
    ).replace(/\/$/, "");
    const reviewUrl = `${appUrl}/admin?tab=payments`;
    const amount = (opts.amountCents / 100).toFixed(2);
    const subject = "New EVC payment proof — review needed";
    const text = [
      `${opts.memberName} submitted an EVC/mobile payment proof for $${amount}.`,
      `Review in admin: ${reviewUrl}`,
    ].join("\n");

    for (const to of recipients) {
      const idempotencyKey = `mail:admin_evc_alert:${opts.proofId}:${this.hashEmail(to)}`;
      try {
        await this.prisma.mailDelivery.create({
          data: {
            idempotencyKey,
            userId: null,
            toHash: this.hashEmail(to),
            template: "admin_evc_alert",
            subject,
            status: "queued",
          },
        });
      } catch (err: unknown) {
        const code =
          err && typeof err === "object" && "code" in err
            ? (err as { code?: string }).code
            : undefined;
        if (code === "P2002") continue;
        throw err;
      }

      await this.queue.enqueue({
        idempotencyKey,
        userId: "",
        to,
        subject,
        text,
        template: "admin_evc_alert",
      });
    }
  }

  private async resolveAdminAlertEmails(): Promise<string[]> {
    const configured = this.config.get<string>("ADMIN_ALERT_EMAILS")?.trim();
    if (configured) {
      return configured
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.includes("@"));
    }

    const staff = await this.prisma.user.findMany({
      where: {
        email: { not: null },
        profile: { role: { in: ["admin", "owner"] }, banned: false },
      },
      select: { email: true },
      take: 10,
    });
    return staff
      .map((s) => s.email)
      .filter((e): e is string => typeof e === "string" && e.includes("@"));
  }

  async queueEvcRejected(userId: string, proofId: string, reason?: string) {
    await this.enqueue({
      userId,
      idempotencyKey: `mail:evc_rejected:${proofId}`,
      template: "evc_rejected",
      subject: "Payment not approved",
      text: reason
        ? `Your EVC payment proof was not approved: ${reason}`
        : "Your EVC payment proof was not approved. Please check the details and submit again, or contact support.",
    });
  }

  async enqueue(opts: {
    userId: string;
    idempotencyKey: string;
    template: PaymentMailTemplate;
    subject: string;
    text: string;
  }) {
    const user = await this.prisma.user.findUnique({
      where: { id: opts.userId },
      select: { email: true },
    });
    if (!user?.email) {
      this.logger.warn(`No email for user — skip mail ${opts.idempotencyKey}`);
      return;
    }

    try {
      await this.prisma.mailDelivery.create({
        data: {
          idempotencyKey: opts.idempotencyKey,
          userId: opts.userId,
          toHash: this.hashEmail(user.email),
          template: opts.template,
          subject: opts.subject,
          status: "queued",
        },
      });
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? (err as { code?: string }).code
          : undefined;
      if (code === "P2002") return; // already queued/sent
      throw err;
    }

    await this.queue.enqueue({
      idempotencyKey: opts.idempotencyKey,
      userId: opts.userId,
      to: user.email,
      subject: opts.subject,
      text: opts.text,
      template: opts.template,
    });
  }

  /** Direct send used by queue worker. */
  async deliverNow(opts: {
    idempotencyKey: string;
    to: string;
    subject: string;
    text: string;
  }) {
    const driver = this.config.get<string>("MAIL_DRIVER") ?? "console";
    if (driver === "disabled") {
      await this.prisma.mailDelivery.updateMany({
        where: { idempotencyKey: opts.idempotencyKey },
        data: { status: "skipped", sentAt: new Date() },
      });
      return;
    }

    await this.mail.send({
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: `<p>${escapeHtml(opts.text)}</p>`,
    });

    await this.prisma.mailDelivery.updateMany({
      where: { idempotencyKey: opts.idempotencyKey },
      data: { status: "sent", sentAt: new Date() },
    });
  }
}
