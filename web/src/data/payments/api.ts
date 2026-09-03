import { apiClient, ApiClientError } from "../api-client";
import { track } from "../telemetry";
import type { PaymentsAdapter, PaystackStatus, WaafiStatus } from "./types";

/**
 * A 404 here means the API host is older than this web build (the route does
 * not exist yet). Treat that as "gateway not available" instead of a hard
 * failure so the checkout UI shows its unavailable notice and moves on.
 */
function isMissingRoute(e: unknown): boolean {
  return e instanceof ApiClientError && e.status === 404;
}

export const apiPayments: PaymentsAdapter = {
  async createRegistrationCheckout(tier) {
    try {
      return await apiClient.post("/payments/stripe/registration-checkout", {
        tier,
      });
    } catch (e) {
      track("checkout_failure");
      throw e;
    }
  },
  async createPremiumUpgradeCheckout() {
    try {
      return await apiClient.post(
        "/payments/stripe/premium-upgrade-checkout",
        {}
      );
    } catch (e) {
      track("checkout_failure");
      throw e;
    }
  },
  async verifySession(sessionId) {
    return apiClient.post("/payments/stripe/verify-session", { sessionId });
  },
  async getStatus() {
    return apiClient.get("/payments/status");
  },
  waafi: {
    async status() {
      try {
        return await apiClient.get<WaafiStatus>("/payments/waafi/status");
      } catch (e) {
        if (isMissingRoute(e)) return { enabled: false };
        throw e;
      }
    },
    async purchase(body) {
      return apiClient.post("/payments/waafi/purchase", body);
    },
  },
  paystack: {
    async status() {
      try {
        return await apiClient.get<PaystackStatus>(
          "/payments/paystack/status"
        );
      } catch (e) {
        if (isMissingRoute(e)) return { enabled: false };
        throw e;
      }
    },
    async startCheckout(body) {
      try {
        return await apiClient.post(
          "/payments/paystack/registration-checkout",
          body
        );
      } catch (e) {
        track("checkout_failure");
        throw e;
      }
    },
    async verify(reference) {
      return apiClient.post("/payments/paystack/verify", { reference });
    },
  },
  evc: {
    async myLatest() {
      return apiClient.get("/payments/evc/me/latest");
    },
    async submitProof(body) {
      const mediaId = String(body.mediaId ?? body.screenshotId ?? "");
      return apiClient.post("/payments/evc/proof/submit", {
        tier: body.tier,
        payerFullName: body.payerFullName,
        lastFourDigits: body.lastFourDigits,
        mediaId,
      });
    },
    async signUpload(body) {
      return apiClient.post("/payments/evc/proof/sign-upload", body);
    },
  },
};