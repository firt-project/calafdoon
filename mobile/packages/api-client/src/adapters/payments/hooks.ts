"use client";

import { useCallback, useEffect, useState } from "react";
import { apiPayments } from "./api";

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
