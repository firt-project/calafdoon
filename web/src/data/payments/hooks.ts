"use client";

import { useCallback, useEffect, useState } from "react";
import { isAbortError, toLoadErrorMessage } from "../query-error";
import { apiPayments } from "./api";
import type {
  PaystackCheckoutResult,
  PaystackStatus,
  WaafiPurchaseResult,
  WaafiStatus,
} from "./types";

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

export function useWaafiEnabled() {
  const [enabled, setEnabled] = useState(false);
  const [configured, setConfigured] = useState<WaafiStatus["configured"]>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void apiPayments.waafi
      .status()
      .then((d) => {
        if (!cancelled) {
          setEnabled(Boolean(d?.enabled));
          setConfigured(d?.configured);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (cancelled || isAbortError(err)) return;
        setEnabled(false);
        setConfigured(undefined);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { enabled, configured, loading };
}

export function useWaafiPurchase() {
  return useCallback(
    async (body: {
      accountNo?: string;
      tier?: "basic" | "premium";
    }): Promise<WaafiPurchaseResult> =>
      apiPayments.waafi.purchase(body) as Promise<WaafiPurchaseResult>,
    []
  );
}

export function usePaystackEnabled() {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<PaystackStatus>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void apiPayments.paystack
      .status()
      .then((d) => {
        if (!cancelled) {
          setEnabled(Boolean(d?.enabled));
          setStatus(d);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (cancelled || isAbortError(err)) return;
        setEnabled(false);
        setStatus(undefined);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { enabled, status, loading };
}

export function usePaystackCheckout() {
  return useCallback(
    async (body: {
      tier?: "basic" | "premium";
      channel?: "mobile_money" | "card" | "bank";
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
  const [proof, setProof] = useState<unknown>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void apiPayments.evc
      .myLatest()
      .then((d) => {
        if (!cancelled) {
          setProof(d);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (cancelled || isAbortError(err)) return;
        setError(toLoadErrorMessage(err));
        setProof((prev: unknown) => (prev === undefined ? null : prev));
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);
  return { proof, error, refresh };
}

export function useSubmitEvcProof() {
  return useCallback(
    async (body: Record<string, unknown>) =>
      apiPayments.evc.submitProof(body),
    []
  );
}
