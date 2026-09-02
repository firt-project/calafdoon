import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import type { ConfigService } from "@nestjs/config";
import { PaystackClient } from "./paystack.client";

function makeClient(env: Record<string, string>): PaystackClient {
  const config = {
    get: (key: string) => env[key],
  } as unknown as ConfigService;
  return new PaystackClient(config);
}

const SECRET = "sk_test_abc123";

describe("PaystackClient config", () => {
  it("reports enabled only when a secret key is present", () => {
    assert.equal(makeClient({}).isConfigured(), false);
    assert.equal(makeClient({ PAYSTACK_SECRET_KEY: SECRET }).isConfigured(), true);
  });

  it("derives the mode from the key prefix", () => {
    assert.equal(makeClient({ PAYSTACK_SECRET_KEY: "sk_live_x" }).mode(), "live");
    assert.equal(makeClient({ PAYSTACK_SECRET_KEY: "sk_test_x" }).mode(), "test");
    assert.equal(makeClient({}).mode(), "unset");
  });

  it("defaults currency to USD and upper-cases overrides", () => {
    assert.equal(makeClient({}).currency(), "USD");
    assert.equal(
      makeClient({ PAYSTACK_CURRENCY: "ngn" }).currency(),
      "NGN"
    );
  });

  it("charges USD cents unchanged when currency is USD", () => {
    const c = makeClient({ PAYSTACK_SECRET_KEY: SECRET });
    assert.equal(c.chargeAmount(499), 499);
    assert.equal(c.chargeAmount(2000), 2000);
  });

  it("converts to the settlement currency via PAYSTACK_USD_RATE", () => {
    const c = makeClient({
      PAYSTACK_SECRET_KEY: SECRET,
      PAYSTACK_CURRENCY: "KES",
      PAYSTACK_USD_RATE: "130",
    });
    // $4.99 -> 499 cents * 130 = 64870 (KES subunit)
    assert.equal(c.chargeAmount(499), 64870);
  });

  it("refuses to charge a non-USD currency with no rate", () => {
    const c = makeClient({
      PAYSTACK_SECRET_KEY: SECRET,
      PAYSTACK_CURRENCY: "KES",
    });
    assert.throws(() => c.chargeAmount(499), /PAYSTACK_USD_RATE is required/);
  });

  it("never leaks secret values in configPresence", () => {
    const presence = makeClient({
      PAYSTACK_SECRET_KEY: SECRET,
      PAYSTACK_PUBLIC_KEY: "pk_test_x",
    }).configPresence();
    assert.deepEqual(presence, { secretKey: true, publicKey: true });
  });
});

describe("PaystackClient.verifyWebhookSignature", () => {
  const client = makeClient({ PAYSTACK_SECRET_KEY: SECRET });
  const body = JSON.stringify({ event: "charge.success", data: { reference: "hel-x" } });
  const goodSig = createHmac("sha512", SECRET).update(body).digest("hex");

  it("accepts a correctly signed payload", () => {
    assert.equal(client.verifyWebhookSignature(body, goodSig), true);
    assert.equal(client.verifyWebhookSignature(Buffer.from(body), goodSig), true);
  });

  it("rejects a tampered body", () => {
    assert.equal(
      client.verifyWebhookSignature(body + " ", goodSig),
      false
    );
  });

  it("rejects a wrong or empty signature", () => {
    assert.equal(client.verifyWebhookSignature(body, "deadbeef"), false);
    assert.equal(client.verifyWebhookSignature(body, ""), false);
  });

  it("rejects when no secret key is configured", () => {
    assert.equal(
      makeClient({}).verifyWebhookSignature(body, goodSig),
      false
    );
  });
});
