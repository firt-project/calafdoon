import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { GrantPaidAccessService } from "./grant-paid-access.service";
import {
  getRegistrationCheckoutDetails,
  isMembershipRenewal,
  periodicRegistrationChargeCents,
  type RegistrationTier,
} from "./pricing";
import {
  normalizeWaafiAccountNo,
  WaafiPayClient,
} from "./waafi-pay.client";
import { hasPaidAccess } from "../common/access";

function amountCentsToWaafi(amountCents: number): string {
  return (amountCents / 100).toFixed(2);
}

/**
 * Resolve the wallet to charge. Any valid mobile-money number the member types
 * is accepted — people routinely pay from a spouse's / relative's wallet, not
 * the number on their dating profile. When the field is left blank we fall back
 * to the phone on file so the UI can still omit it.
 */
export function resolveWaafiPayerAccount(opts: {
  submittedAccountNo?: string | null;
  profilePhone?: string | null;
  userPhone?: string | null;
}):
  | { ok: true; accountNo: string }
  | { ok: false; reason: "missing" | "invalid" } {
  const rawSubmitted = (opts.submittedAccountNo ?? "").trim();
  if (rawSubmitted) {
    const submitted = normalizeWaafiAccountNo(rawSubmitted);
    if (!submitted) {
      return { ok: false, reason: "invalid" };
    }
    return { ok: true, accountNo: submitted };
  }

  // No wallet entered — charge the phone on file, if there is a usable one.
  const fallback =
    normalizeWaafiAccountNo(opts.profilePhone ?? "") ??
    normalizeWaafiAccountNo(opts.userPhone ?? "");
  if (!fallback) {
    return { ok: false, reason: "missing" };
  }
  return { ok: true, accountNo: fallback };
}

@Injectable()
export class WaafiPaymentsService {
  private readonly logger = new Logger(WaafiPaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly waafi: WaafiPayClient,
    private readonly grant: GrantPaidAccessService
  ) {}

  isEnabled(): boolean {
    return this.waafi.isConfigured();
  }

  status() {
    const configured = this.waafi.configPresence();
    return {
      enabled: this.waafi.isConfigured(),
      configured,
    };
  }

  async purchaseRegistration(opts: {
    userId: string;
    accountNo?: string;
    tier?: RegistrationTier;
  }) {
    if (!this.waafi.isConfigured()) {
      throw new ServiceUnavailableException(
        "WaafiPay is temporarily unavailable. Please try card or EVC, or try again shortly."
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

    const resolved = resolveWaafiPayerAccount({
      submittedAccountNo: opts.accountNo,
      profilePhone: user.profile.phone,
      userPhone: user.phone,
    });
    if (!resolved.ok) {
      if (resolved.reason === "missing") {
        throw new BadRequestException(
          "Enter the mobile wallet number you want to pay from"
        );
      }
      throw new BadRequestException(
        "Enter a valid mobile wallet number (e.g. 25261xxxxxxx)"
      );
    }
    const accountNo = resolved.accountNo;

    const tier: RegistrationTier = opts.tier === "premium" ? "premium" : "basic";
    const details = getRegistrationCheckoutDetails(tier, user.profile.gender);
    const isRenewal = isMembershipRenewal(user.profile);
    // Basic: $4.99 first time, $1.00 for each 30-day renewal (mirrors Stripe).
    const amountCents = periodicRegistrationChargeCents({
      tier,
      gender: user.profile.gender,
      isRenewal,
    });

    const referenceId = `hel-${user.id.replace(/-/g, "").slice(0, 12)}-${Date.now()}`;
    const sessionKey = `waafi:${referenceId}`;

    let payment = await this.prisma.payment.findUnique({
      where: { stripeSessionId: sessionKey },
    });
    if (!payment) {
      try {
        payment = await this.prisma.payment.create({
          data: {
            convexId: `local_waafi_pay_${randomUUID()}`,
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

    const result = await this.waafi.purchase({
      accountNo,
      referenceId,
      invoiceId: referenceId,
      amount: amountCentsToWaafi(amountCents),
      currency: "USD",
      description: isRenewal
        ? `${details.productName} — monthly renewal`
        : details.productName,
    });

    if (!result.ok) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: "failed" },
      });
      this.logger.warn(
        `WaafiPay declined user=${user.id} code=${result.responseCode} msg=${result.responseMsg}`
      );
      throw new BadRequestException(
        friendlyWaafiError(result.responseMsg, result.responseCode)
      );
    }

    const fulfillmentKey = `waafi:${result.transactionId ?? referenceId}`;
    await this.grant.applyPaymentCompletion({
      paymentId: payment.id,
      source: "waafi",
      fulfillmentKey,
      forceProfileApproval: true,
    });

    return {
      ok: true as const,
      referenceId,
      transactionId: result.transactionId ?? null,
      amountCents,
      tier,
      isRenewal,
    };
  }
}

function friendlyWaafiError(msg: string, code: string): string {
  const m = (msg || "").toUpperCase();
  if (m.includes("CANCEL") || code === "5306") {
    return "Payment was cancelled on your phone. Try again.";
  }
  if (m.includes("TIMEOUT") || code === "5309") {
    return "Payment timed out. Approve the PIN prompt within a few minutes.";
  }
  if (m.includes("INVALID") || code === "5301") {
    return "Payment could not be started. Check your wallet number and try again.";
  }
  if (m.includes("INSUFFICIENT") || m.includes("BALANCE")) {
    return "Insufficient wallet balance for this payment.";
  }
  return "WaafiPay payment failed. Check your phone PIN prompt and try again.";
}
