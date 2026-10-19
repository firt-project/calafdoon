import { Capacitor } from "@capacitor/core";
import { apiClient } from "@hel/api-client";
import {
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  Purchases,
  type PurchasesPackage,
} from "@revenuecat/purchases-capacitor";

/**
 * Apple In-App Purchase (iOS only), through RevenueCat. The RevenueCat
 * `app_user_id` is our own user id, so the server can look the member up.
 * The server — not the app — decides access: after a purchase we ask the API
 * to re-check the entitlement with RevenueCat.
 */

const IOS_API_KEY = (import.meta.env.VITE_REVENUECAT_IOS_KEY ?? "").trim();

export function iapAvailable(): boolean {
  return Capacitor.getPlatform() === "ios" && IOS_API_KEY.length > 0;
}

export type IapOffer = {
  pkg: PurchasesPackage;
  priceLabel: string;
  title: string;
};

let configuredFor: string | null = null;

async function ensureConfigured(userId: string): Promise<void> {
  if (configuredFor === userId) return;
  if (configuredFor === null) {
    await Purchases.setLogLevel({ level: LOG_LEVEL.WARN });
    await Purchases.configure({ apiKey: IOS_API_KEY, appUserID: userId });
  } else {
    await Purchases.logIn({ appUserID: userId });
  }
  configuredFor = userId;
}

export async function iapLoadOffer(userId: string): Promise<IapOffer | null> {
  await ensureConfigured(userId);
  const offerings = await Purchases.getOfferings();
  const pkg =
    offerings.current?.monthly ?? offerings.current?.availablePackages[0];
  if (!pkg) return null;
  return {
    pkg,
    priceLabel: pkg.product.priceString,
    title: pkg.product.title,
  };
}

async function syncWithServer(): Promise<{ active: boolean }> {
  return apiClient.post<{ active: boolean }>("/payments/revenuecat/sync", {});
}

/** Returns true when the purchase went through and the server unlocked access. */
export async function iapPurchase(
  userId: string,
  offer: IapOffer
): Promise<boolean> {
  await ensureConfigured(userId);
  try {
    await Purchases.purchasePackage({ aPackage: offer.pkg });
  } catch (e) {
    const err = e as { code?: string | number; userCancelled?: boolean };
    if (
      err.userCancelled ||
      String(err.code) === String(PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR)
    ) {
      return false;
    }
    throw e;
  }
  return (await syncWithServer()).active;
}

export async function iapRestore(userId: string): Promise<boolean> {
  await ensureConfigured(userId);
  await Purchases.restorePurchases();
  return (await syncWithServer()).active;
}

export async function iapLogout(): Promise<void> {
  if (configuredFor === null) return;
  configuredFor = "";
  try {
    await Purchases.logOut();
  } catch {
    /* anonymous already */
  }
  configuredFor = null;
}
