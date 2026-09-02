import { apiClient } from "../api-client";
import { track } from "../telemetry";
import type { PaymentsAdapter } from "./types";

export const apiPayments: PaymentsAdapter = {
  async createRegistrationCheckout(tier, opts) {
    try {
      return await apiClient.post("/payments/stripe/registration-checkout", {
        tier,
        client: opts?.client,
      });
    } catch (e) {
      track("checkout_failure");
      throw e;
    }
  },
  async createPremiumUpgradeCheckout(opts) {
    try {
      return await apiClient.post(
        "/payments/stripe/premium-upgrade-checkout",
        { client: opts?.client }
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
      return apiClient.get("/payments/waafi/status");
    },
    async purchase(body) {
      return apiClient.post("/payments/waafi/purchase", body);
    },
  },
  paystack: {
    async status() {
      return apiClient.get("/payments/paystack/status");
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
    async uploadProof(body) {
      return apiClient.post("/payments/evc/proof/upload", {
        contentType: body.contentType || "image/jpeg",
        dataBase64: body.dataBase64,
      });
    },
  },
};