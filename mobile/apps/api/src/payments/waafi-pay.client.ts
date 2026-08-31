import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";

export type WaafiPurchaseInput = {
  accountNo: string;
  referenceId: string;
  invoiceId: string;
  amount: string;
  currency: string;
  description: string;
};

export type WaafiPurchaseResult = {
  ok: boolean;
  responseCode: string;
  responseMsg: string;
  errorCode: string;
  state?: string;
  transactionId?: string;
  referenceId?: string;
  txAmount?: string;
  raw: unknown;
};

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

/**
 * WaafiPay ecommerce API client.
 * Docs: https://docs.waafipay.com/purchase-api
 * Sandbox: https://sandbox.waafipay.com/asm
 * Live: https://api.waafipay.net/asm
 *
 * Required env (Render API service — not Vercel):
 *   WAAFI_MERCHANT_UID
 *   WAAFI_API_USER_ID
 *   WAAFI_API_KEY
 */
@Injectable()
export class WaafiPayClient implements OnModuleInit {
  private readonly logger = new Logger(WaafiPayClient.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const p = this.configPresence();
    this.logger.log(
      `WaafiPay enabled=${this.isConfigured()} merchantUid=${p.merchantUid ? "set" : "missing"} apiUserId=${p.apiUserId ? "set" : "missing"} apiKey=${p.apiKey ? "set" : "missing"}`
    );
  }

  isConfigured(): boolean {
    return Boolean(
      this.merchantUid() && this.apiUserId() && this.apiKey()
    );
  }

  private merchantUid(): string {
    return firstEnv(this.config, ["WAAFI_MERCHANT_UID"]);
  }

  private apiUserId(): string {
    return firstEnv(this.config, ["WAAFI_API_USER_ID"]);
  }

  private apiKey(): string {
    return firstEnv(this.config, ["WAAFI_API_KEY"]);
  }

  /** Safe for clients — which credentials are present (not the values). */
  configPresence(): {
    merchantUid: boolean;
    apiUserId: boolean;
    apiKey: boolean;
  } {
    return {
      merchantUid: Boolean(this.merchantUid()),
      apiUserId: Boolean(this.apiUserId()),
      apiKey: Boolean(this.apiKey()),
    };
  }

  private baseUrl(): string {
    const raw = firstEnv(this.config, ["WAAFI_BASE_URL"]);
    if (raw) return raw.replace(/\/$/, "");
    const env = firstEnv(this.config, ["WAAFI_ENV"]).toLowerCase() || "live";
    return env === "sandbox"
      ? "https://sandbox.waafipay.com/asm"
      : "https://api.waafipay.net/asm";
  }

  async purchase(input: WaafiPurchaseInput): Promise<WaafiPurchaseResult> {
    if (!this.isConfigured()) {
      throw new Error("WaafiPay is not configured");
    }

    const requestId = randomUUID();
    const timestamp = formatWaafiTimestamp(new Date());
    const body = {
      schemaVersion: "1.0",
      requestId,
      timestamp,
      channelName: "WEB",
      serviceName: "API_PURCHASE",
      serviceParams: {
        merchantUid: this.merchantUid(),
        apiUserId: this.apiUserId(),
        apiKey: this.apiKey(),
        paymentMethod: "MWALLET_ACCOUNT",
        payerInfo: {
          accountNo: input.accountNo,
        },
        transactionInfo: {
          referenceId: input.referenceId,
          invoiceId: input.invoiceId,
          amount: input.amount,
          currency: input.currency,
          description: input.description,
        },
      },
    };

    const res = await fetch(this.baseUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      this.logger.warn(`WaafiPay non-JSON response status=${res.status}`);
      return {
        ok: false,
        responseCode: String(res.status),
        responseMsg: "Invalid response from WaafiPay",
        errorCode: "parse_error",
        raw: { status: res.status, body: text.slice(0, 500) },
      };
    }

    const params = (json.params ?? {}) as Record<string, unknown>;
    const responseCode = String(json.responseCode ?? "");
    const responseMsg = String(json.responseMsg ?? "");
    const errorCode = String(json.errorCode ?? "");
    const state = params.state != null ? String(params.state) : undefined;
    const approved =
      responseCode === "2001" &&
      (state ?? "").toUpperCase() === "APPROVED";

    return {
      ok: approved,
      responseCode,
      responseMsg,
      errorCode,
      state,
      transactionId:
        params.transactionId != null
          ? String(params.transactionId)
          : undefined,
      referenceId:
        params.referenceId != null ? String(params.referenceId) : undefined,
      txAmount: params.txAmount != null ? String(params.txAmount) : undefined,
      raw: json,
    };
  }
}

/** WaafiPay expects timestamps like `2024-11-05 09:04:44`. */
export function formatWaafiTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}

/**
 * Normalize payer mobile to Waafi international digits (no +, no spaces).
 * Accepts 2526… / 25263… / 061… / 6… Somalia-style inputs.
 */
export function normalizeWaafiAccountNo(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^(61|62|63|68|90)\d{7,9}$/.test(digits)) {
    digits = `252${digits}`;
  }
  if (/^0(61|62|63|68|90)\d{7,9}$/.test(digits)) {
    digits = `252${digits.slice(1)}`;
  }
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}
