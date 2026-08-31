/** Exact Convex pricing from convex/payments.ts + stripeActions.ts */

export const REGISTRATION_AMOUNT_CENTS = 500;
export const WOMEN_BASIC_AMOUNT_CENTS = 250;
export const PERSONAL_SUPPORT_AMOUNT_CENTS = 2000;
export const PREMIUM_UPGRADE_AMOUNT_CENTS = 1500;
export const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type RegistrationTier = "basic" | "premium";
export type PaymentType =
  | "registration"
  | "registration_premium"
  | "premium_upgrade"
  | "chat";

export function getRegistrationCheckoutDetails(
  tier: RegistrationTier,
  gender?: string | null
) {
  if (tier === "premium") {
    const womenPremium = gender === "female";
    return {
      amount: womenPremium
        ? PREMIUM_UPGRADE_AMOUNT_CENTS
        : PERSONAL_SUPPORT_AMOUNT_CENTS,
      paymentType: "registration_premium" as const,
      registrationTier: "premium" as const,
      productName: "Hel Calafkaaga Premium",
      productDescription: womenPremium
        ? "WhatsApp personal support and help finding your match"
        : "Full app access plus WhatsApp personal support and help finding your match",
      metadataType: "registration" as const,
    };
  }

  const womenBasic = gender === "female";
  return {
    amount: womenBasic ? WOMEN_BASIC_AMOUNT_CENTS : REGISTRATION_AMOUNT_CENTS,
    paymentType: "registration" as const,
    registrationTier: "basic" as const,
    productName: womenBasic
      ? "Hel Calafkaaga Basic Registration (Women)"
      : "Hel Calafkaaga Basic Registration",
    productDescription:
      "One-time registration — full access to matches and messaging",
    metadataType: "registration" as const,
  };
}

export function amountForEvcTier(
  tier: RegistrationTier,
  gender: "male" | "female"
): number {
  if (tier === "premium") {
    return gender === "female"
      ? PREMIUM_UPGRADE_AMOUNT_CENTS
      : PERSONAL_SUPPORT_AMOUNT_CENTS;
  }
  return gender === "female"
    ? WOMEN_BASIC_AMOUNT_CENTS
    : REGISTRATION_AMOUNT_CENTS;
}

export function isPremiumPayment(opts: {
  registrationTier?: string | null;
  paymentType?: string | null;
}): boolean {
  return (
    opts.registrationTier === "premium" ||
    opts.paymentType === "registration_premium" ||
    opts.paymentType === "premium_upgrade"
  );
}

export const CHECKOUT_MODE = "payment" as const;
