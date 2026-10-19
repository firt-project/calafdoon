import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { GrantPaidAccessService } from "./grant-paid-access.service";
import { REGISTRATION_AMOUNT_CENTS } from "./pricing";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION_PREFIX = "revenuecat:";

/**
 * Apple In-App Purchase membership (iOS), verified through RevenueCat.
 *
 * The app never tells us "I paid" — it only asks us to re-check. We always
 * read the truth from RevenueCat's REST API for the caller's own user id, so a
 * forged request cannot unlock anything. `paidUntil` is the store's own
 * entitlement expiry, which ends access on lapse, refund or billing failure.
 */
@Injectable()
export class RevenueCatService {
  private readonly logger = new Logger(RevenueCatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly grant: GrantPaidAccessService
  ) {}

  private secretKey(): string {
    return (this.config.get<string>("REVENUECAT_SECRET_API_KEY") ?? "").trim();
  }

  private entitlementId(): string {
    return (
      this.config.get<string>("REVENUECAT_ENTITLEMENT")?.trim() || "membership"
    );
  }

  isConfigured(): boolean {
    return this.secretKey().length > 0;
  }

  /** Webhook header must equal REVENUECAT_WEBHOOK_SECRET (constant-time). */
  assertWebhookAuth(header: string | undefined): void {
    const expected = (
      this.config.get<string>("REVENUECAT_WEBHOOK_SECRET") ?? ""
    ).trim();
    if (!expected) {
      throw new ServiceUnavailableException("Webhook not configured");
    }
    const given = Buffer.from((header ?? "").replace(/^Bearer\s+/i, "").trim());
    const want = Buffer.from(expected);
    if (given.length !== want.length || !timingSafeEqual(given, want)) {
      throw new UnauthorizedException("Invalid webhook authorization");
    }
  }

  /** Webhook: payload is only a hint — re-read the subscriber from RevenueCat. */
  async handleWebhook(body: unknown): Promise<{ received: true }> {
    const event =
      body && typeof body === "object"
        ? ((body as { event?: Record<string, unknown> }).event ?? {})
        : {};
    const ids = new Set<string>();
    for (const key of ["app_user_id", "original_app_user_id"]) {
      const v = event[key];
      if (typeof v === "string" && UUID_RE.test(v)) ids.add(v.toLowerCase());
    }
    const aliases = event["aliases"];
    if (Array.isArray(aliases)) {
      for (const a of aliases) {
        if (typeof a === "string" && UUID_RE.test(a)) ids.add(a.toLowerCase());
      }
    }
    for (const id of ids) {
      try {
        await this.syncUser(id);
      } catch (err) {
        this.logger.warn(
          `RevenueCat webhook sync failed: ${err instanceof Error ? err.message : "unknown"}`
        );
        // Let RevenueCat retry on transient failures.
        throw err;
      }
    }
    return { received: true };
  }

  /** Reads the entitlement expiry for `userId` from RevenueCat. */
  private async fetchExpiry(userId: string): Promise<Date | null> {
    const res = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
      {
        headers: {
          Authorization: `Bearer ${this.secretKey()}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!res.ok) {
      throw new ServiceUnavailableException(
        "Could not verify your purchase right now. Please try again."
      );
    }
    const json = (await res.json()) as {
      subscriber?: {
        entitlements?: Record<string, { expires_date?: string | null }>;
      };
    };
    const ent = json.subscriber?.entitlements?.[this.entitlementId()];
    if (!ent) return null;
    if (!ent.expires_date) {
      // Non-expiring entitlement: not used by this app, treat as one year.
      return new Date(Date.now() + 365 * 86_400_000);
    }
    const d = new Date(ent.expires_date);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  /**
   * Re-check one member against RevenueCat and apply the result.
   * Idempotent: one Payment row per entitlement period.
   */
  async syncUser(userId: string): Promise<{
    active: boolean;
    paidUntil: string | null;
  }> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        "In-app purchases are not available right now."
      );
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!user?.profile) {
      throw new BadRequestException("Complete your profile before subscribing");
    }

    const expiry = await this.fetchExpiry(userId);
    const now = Date.now();

    if (!expiry || expiry.getTime() <= now) {
      // Lapsed or refunded: if our last grant came from Apple, end access at
      // the store's expiry (never extends, never touches other gateways).
      if (
        expiry &&
        user.profile.paidUntil &&
        user.profile.paidUntil.getTime() > expiry.getTime()
      ) {
        const last = await this.prisma.payment.findFirst({
          where: { userId, status: "completed" },
          orderBy: { paymentCreatedAt: "desc" },
        });
        if (last?.stripeSessionId.startsWith(SESSION_PREFIX)) {
          await this.prisma.profile.update({
            where: { id: user.profile.id },
            data: { paidUntil: expiry },
          });
        }
      }
      return { active: false, paidUntil: expiry ? expiry.toISOString() : null };
    }

    const sessionKey = `${SESSION_PREFIX}${userId}:${expiry.getTime()}`;
    let payment = await this.prisma.payment.findUnique({
      where: { stripeSessionId: sessionKey },
    });
    if (!payment) {
      try {
        payment = await this.prisma.payment.create({
          data: {
            convexId: `local_revenuecat_pay_${randomUUID()}`,
            userId,
            convexUserId: user.convexId,
            stripeSessionId: sessionKey,
            amount: REGISTRATION_AMOUNT_CENTS,
            paymentType: "registration",
            registrationTier: "basic",
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
    if (!payment) throw new ServiceUnavailableException("Could not record purchase");

    await this.grant.applyPaymentCompletion({
      paymentId: payment.id,
      source: "revenuecat",
      fulfillmentKey: sessionKey,
      paidUntilOverride: expiry,
    });
    return { active: true, paidUntil: expiry.toISOString() };
  }
}
