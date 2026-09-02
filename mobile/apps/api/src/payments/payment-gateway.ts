import type { Prisma } from "@prisma/client";

/** How a payment was collected — inferred from session / fulfillment keys. */
export type PaymentGateway = "stripe" | "waafi" | "paystack" | "manual";

const GATEWAYS: PaymentGateway[] = ["stripe", "waafi", "paystack", "manual"];

export function isPaymentGateway(value: string): value is PaymentGateway {
  return (GATEWAYS as string[]).includes(value);
}

export function inferPaymentGateway(row: {
  stripeSessionId: string;
  fulfillmentKey?: string | null;
}): PaymentGateway {
  const sid = row.stripeSessionId ?? "";
  if (sid.startsWith("waafi:")) return "waafi";
  if (sid.startsWith("paystack:")) return "paystack";
  if (sid.startsWith("evc:")) return "manual";
  const fk = row.fulfillmentKey ?? "";
  if (fk.startsWith("waafi:")) return "waafi";
  if (fk.startsWith("paystack:")) return "paystack";
  if (fk.startsWith("evc:")) return "manual";
  return "stripe";
}

export function gatewayWhere(gateway: PaymentGateway): Prisma.PaymentWhereInput {
  if (gateway === "waafi") {
    return { stripeSessionId: { startsWith: "waafi:" } };
  }
  if (gateway === "paystack") {
    return { stripeSessionId: { startsWith: "paystack:" } };
  }
  if (gateway === "manual") {
    return { stripeSessionId: { startsWith: "evc:" } };
  }
  return {
    AND: [
      { NOT: { stripeSessionId: { startsWith: "waafi:" } } },
      { NOT: { stripeSessionId: { startsWith: "paystack:" } } },
      { NOT: { stripeSessionId: { startsWith: "evc:" } } },
    ],
  };
}

/** How ongoing access is billed after the first payment. */
export type MembershipType =
  | "none"
  | "stripe_subscription"
  | "waafi_period"
  | "paystack_period"
  | "evc_period"
  | "legacy";

export function inferMembershipType(opts: {
  hasPaid: boolean;
  paidUntil?: Date | null;
  gateway?: PaymentGateway;
}): MembershipType {
  if (!opts.hasPaid) return "none";
  if (opts.paidUntil != null) {
    if (opts.gateway === "waafi") return "waafi_period";
    if (opts.gateway === "paystack") return "paystack_period";
    return "evc_period";
  }
  if (opts.gateway === "stripe") return "stripe_subscription";
  return "legacy";
}

export function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
