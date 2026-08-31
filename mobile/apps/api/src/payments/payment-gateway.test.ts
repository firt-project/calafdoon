import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  gatewayWhere,
  inferMembershipType,
  inferPaymentGateway,
  isPaymentGateway,
} from "../payments/payment-gateway";

describe("payment-gateway", () => {
  it("infers waafi, manual, and stripe", () => {
    assert.equal(
      inferPaymentGateway({ stripeSessionId: "waafi:hel-abc-123" }),
      "waafi"
    );
    assert.equal(
      inferPaymentGateway({ stripeSessionId: "evc:proof-uuid" }),
      "manual"
    );
    assert.equal(
      inferPaymentGateway({ stripeSessionId: "cs_test_abc123" }),
      "stripe"
    );
    assert.equal(
      inferPaymentGateway({
        stripeSessionId: "cs_x",
        fulfillmentKey: "waafi:txn-1",
      }),
      "waafi"
    );
  });

  it("validates gateway filter values", () => {
    assert.equal(isPaymentGateway("stripe"), true);
    assert.equal(isPaymentGateway("waafi"), true);
    assert.equal(isPaymentGateway("manual"), true);
    assert.equal(isPaymentGateway("paypal"), false);
  });

  it("builds gateway where clauses", () => {
    const waafi = gatewayWhere("waafi") as { stripeSessionId?: { startsWith: string } };
    assert.equal(waafi.stripeSessionId?.startsWith, "waafi:");
  });

  it("infers membership billing model", () => {
    assert.equal(
      inferMembershipType({
        hasPaid: true,
        paidUntil: new Date(),
        gateway: "waafi",
      }),
      "waafi_period"
    );
    assert.equal(
      inferMembershipType({
        hasPaid: true,
        paidUntil: null,
        gateway: "stripe",
      }),
      "stripe_subscription"
    );
  });
});
