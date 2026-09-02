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
  /** true when the member was charged the $1 monthly renewal rate. */
  isRenewal?: boolean;
};

export type PaystackStatus = {
  enabled: boolean;
  configured?: { secretKey: boolean; publicKey: boolean };
  mode?: "live" | "test" | "unset";
  currency?: string;
  publicKey?: string | null;
};

export type PaystackCheckoutResult = {
  ok: true;
  authorizationUrl: string;
  reference: string;
  amountCents: number;
  tier: "basic" | "premium";
  /** true when the member was charged the $1 monthly renewal rate. */
  isRenewal: boolean;
};

export type PaystackVerifyResult = {
  success: true;
  alreadyCompleted: boolean;
  isPremium: boolean;
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
  paystack: {
    status(): Promise<PaystackStatus>;
    startCheckout(body: {
      tier?: "basic" | "premium";
    }): Promise<PaystackCheckoutResult>;
    verify(reference: string): Promise<PaystackVerifyResult>;
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

export const PAYSTACK_METHOD_NAMES = [
  "status",
  "startCheckout",
  "verify",
] as const;
