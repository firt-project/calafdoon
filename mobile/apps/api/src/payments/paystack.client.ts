import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "node:crypto";

const PAYSTACK_BASE_URL = "https://api.paystack.co";

function firstEnv(config: ConfigService, keys: string[]): string {
  for (const key of keys) {
    const fromConfig = config.get<string>(key);
    if (typeof fromConfig === "string" && fromConfig.trim()) {
      return fromConfig.trim();
    }
    const fromProcess = process.env[key];
    if (typeof fromProcess === "string" && fromProcess.trim()) {
      return fromProcess.trim();
    }
  }
  return "";
}

export type PaystackInitInput = {
  email: string;
  /** Smallest currency unit (cents / kobo) — same integer we store on Payment.amount. */
  amount: number;
  currency: string;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
};

export type PaystackInitResult =
  | { ok: true; authorizationUrl: string; accessCode: string; reference: string }
  | { ok: false; message: string; raw: unknown };

export type PaystackVerifyResult =
  | {
      ok: true;
      status: string;
      paid: boolean;
      amount: number;
      currency: string;
      reference: string;
      authorizationCode: string | null;
      reusable: boolean;
      customerEmail: string | null;
      metadata: Record<string, unknown>;
      raw: unknown;
    }
  | { ok: false; message: string; raw: unknown };

/**
 * Paystack transaction API client.
 * Docs: https://paystack.com/docs/api/transaction
 * Webhooks: https://paystack.com/docs/payments/webhooks
 *
 * Required env (Render API service — never Vercel / never committed):
 *   PAYSTACK_SECRET_KEY   sk_live_… (or sk_test_… in staging)
 *   PAYSTACK_PUBLIC_KEY   pk_live_… (surfaced to the browser only)
 * Optional:
 *   PAYSTACK_CURRENCY     default USD — must match your Paystack account settlement currency
 */
@Injectable()
export class PaystackClient implements OnModuleInit {
  private readonly logger = new Logger(PaystackClient.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const p = this.configPresence();
    this.logger.log(
      `Paystack enabled=${this.isConfigured()} mode=${this.mode()} ` +
        `secretKey=${p.secretKey ? "set" : "missing"} publicKey=${p.publicKey ? "set" : "missing"} ` +
        `currency=${this.currency()}`
    );
  }

  isConfigured(): boolean {
    return Boolean(this.secretKey());
  }

  private secretKey(): string {
    return firstEnv(this.config, ["PAYSTACK_SECRET_KEY"]);
  }

  publicKey(): string {
    return firstEnv(this.config, ["PAYSTACK_PUBLIC_KEY"]);
  }

  currency(): string {
    return (
      firstEnv(this.config, ["PAYSTACK_CURRENCY"]).toUpperCase() || "USD"
    );
  }

  /** Units of PAYSTACK_CURRENCY per 1 USD. 0 when unset / invalid. */
  usdRate(): number {
    const raw = Number(firstEnv(this.config, ["PAYSTACK_USD_RATE"]));
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  }

  /**
   * Convert a USD-cent plan price into the smallest unit of the settlement
   * currency to send to Paystack. USD: unchanged. Otherwise applies
   * PAYSTACK_USD_RATE (throws if that is missing, so we never silently
   * charge the wrong amount).
   */
  chargeAmount(usdCents: number): number {
    if (this.currency() === "USD") return usdCents;
    const rate = this.usdRate();
    if (!rate) {
      throw new Error(
        `PAYSTACK_USD_RATE is required when PAYSTACK_CURRENCY=${this.currency()}`
      );
    }
    return Math.round(usdCents * rate);
  }

  /** live | test | unset — derived from the secret key prefix. */
  mode(): "live" | "test" | "unset" {
    const key = this.secretKey();
    if (key.startsWith("sk_live_")) return "live";
    if (key.startsWith("sk_test_")) return "test";
    return "unset";
  }

  /** Safe for clients — which credentials are present (not the values). */
  configPresence(): { secretKey: boolean; publicKey: boolean } {
    return {
      secretKey: Boolean(this.secretKey()),
      publicKey: Boolean(this.publicKey()),
    };
  }

  private authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.secretKey()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  async initializeTransaction(
    input: PaystackInitInput
  ): Promise<PaystackInitResult> {
    if (!this.isConfigured()) {
      throw new Error("Paystack is not configured");
    }
    let json: Record<string, unknown> = {};
    try {
      const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
        method: "POST",
        headers: this.authHeaders(),
        body: JSON.stringify({
          email: input.email,
          amount: input.amount,
          currency: input.currency,
          reference: input.reference,
          callback_url: input.callbackUrl,
          metadata: input.metadata,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      const text = await res.text();
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch (err) {
      const message = err instanceof Error ? err.message : "network error";
      this.logger.warn(`Paystack initialize failed: ${message}`);
      return { ok: false, message: "Could not reach Paystack", raw: { message } };
    }

    const data = (json.data ?? {}) as Record<string, unknown>;
    if (json.status === true && typeof data.authorization_url === "string") {
      return {
        ok: true,
        authorizationUrl: data.authorization_url,
        accessCode: String(data.access_code ?? ""),
        reference: String(data.reference ?? input.reference),
      };
    }
    return {
      ok: false,
      message: String(json.message ?? "Paystack rejected the transaction"),
      raw: json,
    };
  }

  async verifyTransaction(reference: string): Promise<PaystackVerifyResult> {
    if (!this.isConfigured()) {
      throw new Error("Paystack is not configured");
    }
    let json: Record<string, unknown> = {};
    try {
      const res = await fetch(
        `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
        {
          method: "GET",
          headers: this.authHeaders(),
          signal: AbortSignal.timeout(30_000),
        }
      );
      const text = await res.text();
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch (err) {
      const message = err instanceof Error ? err.message : "network error";
      this.logger.warn(`Paystack verify failed: ${message}`);
      return { ok: false, message: "Could not reach Paystack", raw: { message } };
    }

    if (json.status !== true || typeof json.data !== "object" || !json.data) {
      return {
        ok: false,
        message: String(json.message ?? "Transaction not found"),
        raw: json,
      };
    }
    const data = json.data as Record<string, unknown>;
    const auth = (data.authorization ?? {}) as Record<string, unknown>;
    const customer = (data.customer ?? {}) as Record<string, unknown>;
    const status = String(data.status ?? "");
    return {
      ok: true,
      status,
      paid: status === "success",
      amount: Number(data.amount ?? 0),
      currency: String(data.currency ?? ""),
      reference: String(data.reference ?? reference),
      authorizationCode:
        typeof auth.authorization_code === "string"
          ? auth.authorization_code
          : null,
      reusable: auth.reusable === true,
      customerEmail:
        typeof customer.email === "string" ? customer.email : null,
      metadata: (data.metadata ?? {}) as Record<string, unknown>,
      raw: json,
    };
  }

  /**
   * Verify a webhook payload — Paystack signs the raw body with HMAC-SHA512
   * keyed by the secret key and sends it in `x-paystack-signature`.
   */
  verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean {
    const key = this.secretKey();
    if (!key || !signature) return false;
    const expected = createHmac("sha512", key)
      .update(typeof rawBody === "string" ? Buffer.from(rawBody) : rawBody)
      .digest("hex");
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signature, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
}
