"use client";

import { useCallback, useEffect, useState } from "react";
import { apiPayments } from "./api";
import type { PaystackCheckoutResult, PaystackStatus } from "./types";

export function useCreateRegistrationCheckout() {
  return useCallback(
    async (args: { tier: string }) =>
      apiPayments.createRegistrationCheckout(args.tier),
    []
  );
}

export function useCreatePremiumUpgradeCheckout() {
  return useCallback(
    async () => apiPayments.createPremiumUpgradeCheckout(),
    []
  );
}

export function useVerifyCheckoutSession() {
  return useCallback(
    async (args: { sessionId: string }) =>
      apiPayments.verifySession(args.sessionId),
    []
  );
}

export function usePaystackEnabled() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [status, setStatus] = useState<PaystackStatus | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void apiPayments.paystack
      .status()
      .then((s) => {
        if (!cancelled) {
          setEnabled(Boolean(s?.enabled));
          setStatus(s);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEnabled(false);
          setStatus(undefined);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { enabled, status };
}

export function usePaystackCheckout() {
  return useCallback(
    async (body: {
      tier?: "basic" | "premium";
    }): Promise<PaystackCheckoutResult> =>
      apiPayments.paystack.startCheckout(body) as Promise<PaystackCheckoutResult>,
    []
  );
}

export function useVerifyPaystackReference() {
  return useCallback(
    async (args: { reference: string }) =>
      apiPayments.paystack.verify(args.reference),
    []
  );
}

export function useEvcLatestProof() {
  const [apiData, setApiData] = useState<unknown>(undefined);

  useEffect(() => {
    let cancelled = false;
    void apiPayments.evc
      .myLatest()
      .then((d) => {
        if (!cancelled) setApiData(d);
      })
      .catch(() => {
        if (!cancelled) setApiData(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return apiData;
}

export function useSubmitEvcProof() {
  return useCallback(
    async (body: Record<string, unknown>) =>
      apiPayments.evc.submitProof(body),
    []
  );
}
