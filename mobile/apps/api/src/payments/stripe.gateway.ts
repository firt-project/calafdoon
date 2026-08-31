import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import {
  CHECKOUT_MODE,
  PERSONAL_SUPPORT_AMOUNT_CENTS,
  PREMIUM_UPGRADE_AMOUNT_CENTS,
  REGISTRATION_AMOUNT_CENTS,
} from "./pricing";

export type CheckoutCreateInput = {
  amountCents: number;
  productName: string;
  productDescription: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  /**
   * Registration Basic: Stripe subscription ($1/mo) + one-time setup so the
   * first invoice is $4.99, then $1/month.
   */
  subscription?: {
    monthlyCents: number;
    setupCents: number;
    monthlyProductName: string;
    setupProductName: string;
  };
};

export type CheckoutSessionView = {
  id: string;
  url: string | null;
  payment_status: string;
  amount_total: number | null;
  metadata: Record<string, string> | null;
};

export interface StripeGateway {
  createCheckoutSession(
    input: CheckoutCreateInput
  ): Promise<CheckoutSessionView>;
  retrieveSession(sessionId: string): Promise<CheckoutSessionView>;
  constructEvent(
    rawBody: string | Buffer,
    signature: string
  ): Stripe.Event | FakeStripeEvent;
}

export type FakeStripeEvent = {
  id: string;
  type: string;
  data: { object: CheckoutSessionView & { object?: string } };
};

/**
 * Real Stripe client — test-mode keys only in local env.
 * Rejects live keys unless STRIPE_ALLOW_LIVE=true (never set in Phase 8).
 */
@Injectable()
export class StripeService implements StripeGateway {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe | null;
  private readonly webhookSecret: string;

  constructor(private readonly config: ConfigService) {
    const key = this.config.get<string>("STRIPE_SECRET_KEY") ?? "";
    this.webhookSecret =
      this.config.get<string>("STRIPE_WEBHOOK_SECRET") ?? "";
    if (key.startsWith("sk_live_") && this.config.get("STRIPE_ALLOW_LIVE") !== "true") {
      this.logger.error("Live Stripe key blocked — use sk_test_ only");
      this.stripe = null;
      return;
    }
    this.stripe = key ? new Stripe(key) : null;
  }

  private requireClient(): Stripe {
    if (!this.stripe) {
      throw new Error(
        "Stripe is not configured. Set STRIPE_SECRET_KEY to a sk_test_ key."
      );
    }
    return this.stripe;
  }

  async createCheckoutSession(
    input: CheckoutCreateInput
  ): Promise<CheckoutSessionView> {
    const stripe = this.requireClient();
    const sub = input.subscription;
    const session = sub
      ? await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "subscription",
          line_items: [
            {
              price_data: {
                currency: "usd",
                unit_amount: sub.monthlyCents,
                recurring: { interval: "month" },
                product_data: {
                  name: sub.monthlyProductName,
                  description: input.productDescription,
                },
              },
              quantity: 1,
            },
            {
              price_data: {
                currency: "usd",
                unit_amount: sub.setupCents,
                product_data: {
                  name: sub.setupProductName,
                  description: "First-month membership unlock",
                },
              },
              quantity: 1,
            },
          ],
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          metadata: input.metadata,
        })
      : await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: input.productName,
                  description: input.productDescription,
                },
                unit_amount: input.amountCents,
              },
              quantity: 1,
            },
          ],
          mode: CHECKOUT_MODE,
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          metadata: input.metadata,
        });
    return {
      id: session.id,
      url: session.url,
      payment_status: session.payment_status,
      amount_total: session.amount_total,
      metadata: session.metadata as Record<string, string> | null,
    };
  }

  async retrieveSession(sessionId: string): Promise<CheckoutSessionView> {
    const stripe = this.requireClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return {
      id: session.id,
      url: session.url,
      payment_status: session.payment_status,
      amount_total: session.amount_total,
      metadata: session.metadata as Record<string, string> | null,
    };
  }

  constructEvent(rawBody: string | Buffer, signature: string) {
    const stripe = this.requireClient();
    if (!this.webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
    }
    return stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.webhookSecret
    );
  }
}

/** In-memory fake for unit/e2e — no network. */
export class FakeStripeGateway implements StripeGateway {
  sessions = new Map<string, CheckoutSessionView>();
  events = new Map<string, FakeStripeEvent>();
  failSignature = false;
  nextSessionId = 1;

  async createCheckoutSession(
    input: CheckoutCreateInput
  ): Promise<CheckoutSessionView> {
    const id = `cs_test_fake_${this.nextSessionId++}`;
    const session: CheckoutSessionView = {
      id,
      url: `https://checkout.stripe.test/pay/${id}`,
      payment_status: "unpaid",
      amount_total: input.amountCents,
      metadata: input.metadata,
    };
    this.sessions.set(id, session);
    return session;
  }

  async retrieveSession(sessionId: string): Promise<CheckoutSessionView> {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error("No such checkout.session");
    return s;
  }

  markPaid(sessionId: string) {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error("No such session");
    s.payment_status = "paid";
    this.sessions.set(sessionId, s);
    return s;
  }

  constructEvent(rawBody: string | Buffer, signature: string) {
    if (this.failSignature || signature !== "t=1,v1=valid_test_sig") {
      throw new Error("Invalid webhook signature");
    }
    const parsed = JSON.parse(
      typeof rawBody === "string" ? rawBody : rawBody.toString("utf8")
    ) as FakeStripeEvent;
    if (this.events.has(parsed.id)) {
      return parsed;
    }
    this.events.set(parsed.id, parsed);
    return parsed;
  }
}

export function amountFallbackFromMetadata(meta: {
  type?: string;
  tier?: string;
}): number {
  if (meta.type === "premium_upgrade") return PREMIUM_UPGRADE_AMOUNT_CENTS;
  if (meta.tier === "premium") return PERSONAL_SUPPORT_AMOUNT_CENTS;
  return REGISTRATION_AMOUNT_CENTS;
}

export const STRIPE_GATEWAY = "STRIPE_GATEWAY";
