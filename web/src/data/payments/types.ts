export type WaafiStatus = {
  enabled: boolean;
  configured?: {
    merchantUid: boolean;
    apiUserId: boolean;
    apiKey: boolean;
  };
};

export type WaafiPurchaseResult = {
  ok: true;
  referenceId: string;
  transactionId: string | null;
  amountCents: number;
  tier: string;
};

export type PaymentsAdapter = {
  createRegistrationCheckout(tier: string): Promise<{ url?: string; [k: string]: unknown }>;
  createPremiumUpgradeCheckout(): Promise<{ url?: string; [k: string]: unknown }>;
  verifySession(sessionId: string): Promise<unknown>;
  getStatus(): Promise<unknown>;
  waafi: {
    status(): Promise<WaafiStatus>;
    purchase(body: {
      accountNo?: string;
      tier?: "basic" | "premium";
    }): Promise<WaafiPurchaseResult>;
  };
  evc: {
    myLatest(): Promise<unknown>;
    submitProof(body: Record<string, unknown>): Promise<unknown>;
    signUpload(body: Record<string, unknown>): Promise<unknown>;
  };
};

export const PAYMENTS_METHOD_NAMES = [
  "createRegistrationCheckout",
  "createPremiumUpgradeCheckout",
  "verifySession",
  "getStatus",
] as const;

export const EVC_METHOD_NAMES = ["myLatest", "submitProof", "signUpload"] as const;

export const WAAFI_METHOD_NAMES = ["status", "purchase"] as const;
