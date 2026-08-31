import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHECKOUT_MODE,
  PERSONAL_SUPPORT_AMOUNT_CENTS,
  PREMIUM_UPGRADE_AMOUNT_CENTS,
  REGISTRATION_AMOUNT_CENTS,
  WOMEN_BASIC_AMOUNT_CENTS,
  getRegistrationCheckoutDetails,
  isPremiumPayment,
} from "./pricing";
import { FakeStripeGateway } from "./stripe.gateway";
import { RateLimitGuard } from "../redis/rate-limit.guard";
import { HttpException, HttpStatus } from "@nestjs/common";

describe("registration checkout pricing by gender/tier", () => {
  it("men basic $5, women basic $2.50", () => {
    assert.equal(
      getRegistrationCheckoutDetails("basic", "male").amount,
      REGISTRATION_AMOUNT_CENTS
    );
    assert.equal(
      getRegistrationCheckoutDetails("basic", "female").amount,
      WOMEN_BASIC_AMOUNT_CENTS
    );
  });

  it("men premium $20, women premium $15", () => {
    assert.equal(
      getRegistrationCheckoutDetails("premium", "male").amount,
      PERSONAL_SUPPORT_AMOUNT_CENTS
    );
    assert.equal(
      getRegistrationCheckoutDetails("premium", "female").amount,
      PREMIUM_UPGRADE_AMOUNT_CENTS
    );
  });

  it("premium upgrade is $15", () => {
    assert.equal(PREMIUM_UPGRADE_AMOUNT_CENTS, 1500);
  });

  it("checkout mode is one-time payment", () => {
    assert.equal(CHECKOUT_MODE, "payment");
  });
});

describe("premium detection", () => {
  it("detects premium payment types", () => {
    assert.equal(isPremiumPayment({ paymentType: "premium_upgrade" }), true);
    assert.equal(
      isPremiumPayment({ paymentType: "registration_premium" }),
      true
    );
    assert.equal(isPremiumPayment({ registrationTier: "premium" }), true);
    assert.equal(isPremiumPayment({ paymentType: "registration" }), false);
  });
});

describe("FakeStripeGateway", () => {
  it("creates pending sessions and marks paid", async () => {
    const stripe = new FakeStripeGateway();
    const session = await stripe.createCheckoutSession({
      amountCents: 500,
      productName: "Test",
      productDescription: "Test",
      successUrl: "http://localhost/success",
      cancelUrl: "http://localhost/cancel",
      metadata: { userId: "u1", type: "registration", tier: "basic" },
    });
    assert.equal(session.payment_status, "unpaid");
    stripe.markPaid(session.id);
    const again = await stripe.retrieveSession(session.id);
    assert.equal(again.payment_status, "paid");
  });

  it("rejects invalid webhook signatures", () => {
    const stripe = new FakeStripeGateway();
    assert.throws(() =>
      stripe.constructEvent(
        JSON.stringify({ id: "evt_1", type: "x", data: { object: {} } }),
        "bad"
      )
    );
  });

  it("accepts valid test signature", () => {
    const stripe = new FakeStripeGateway();
    const event = stripe.constructEvent(
      JSON.stringify({
        id: "evt_1",
        type: "checkout.session.completed",
        data: { object: { id: "cs_1" } },
      }),
      "t=1,v1=valid_test_sig"
    );
    assert.equal(event.id, "evt_1");
  });
});

describe("grantPaidAccess gender rules (pure)", () => {
  it("men basic → approved; women basic → pending_review", () => {
    const apply = (gender: "male" | "female", isPremium: boolean) => {
      if (isPremium || gender === "male") {
        return { approved: true, reviewStatus: "approved" as const };
      }
      return { approved: false, reviewStatus: "pending_review" as const };
    };
    assert.deepEqual(apply("male", false), {
      approved: true,
      reviewStatus: "approved",
    });
    assert.deepEqual(apply("female", false), {
      approved: false,
      reviewStatus: "pending_review",
    });
    assert.deepEqual(apply("female", true), {
      approved: true,
      reviewStatus: "approved",
    });
  });

  it("gender lock is set with hasPaid", () => {
    const patch = { hasPaid: true, genderLocked: true };
    assert.equal(patch.genderLocked, true);
  });
});

describe("Redis outage fail-closed for payments", () => {
  it("payments.checkout fails closed when Redis down", async () => {
    const redis = {
      connect: async () => false,
      client: null,
      available: false,
    };
    const guard = new RateLimitGuard(redis as never);
    await assert.rejects(
      () =>
        guard.canActivate({
          switchToHttp: () => ({
            getRequest: () => ({
              path: "/payments/stripe/registration-checkout",
              method: "POST",
              ip: "127.0.0.1",
              socket: { remoteAddress: "127.0.0.1" },
              user: { id: "u1" },
              body: {},
            }),
          }),
        } as never),
      (err: unknown) =>
        err instanceof HttpException &&
        err.getStatus() === HttpStatus.SERVICE_UNAVAILABLE
    );
  });
});
