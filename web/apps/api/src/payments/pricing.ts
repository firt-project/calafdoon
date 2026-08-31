/** Current registration / premium pricing (cents). */

/** First charge to unlock the app (Basic). */
export const REGISTRATION_AMOUNT_CENTS = 499;
/** Same as REGISTRATION_AMOUNT_CENTS — men and women Basic are both $4.99. */
export const WOMEN_BASIC_AMOUNT_CENTS = 499;
/** Recurring membership after the first payment. */
export const MONTHLY_AMOUNT_CENTS = 100;
/**
 * One-time setup added on Stripe subscription checkout so the first invoice is
 * $4.99 ($3.99 setup + $1.00 first month), then $1/month.
 */
export const REGISTRATION_SETUP_AMOUNT_CENTS =
  REGISTRATION_AMOUNT_CENTS - MONTHLY_AMOUNT_CENTS;
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
    amount: REGISTRATION_AMOUNT_CENTS,
    monthlyAmountCents: MONTHLY_AMOUNT_CENTS,
    setupAmountCents: REGISTRATION_SETUP_AMOUNT_CENTS,
    paymentType: "registration" as const,
    registrationTier: "basic" as const,
    productName: womenBasic
      ? "Hel Calafkaaga Membership (Women)"
      : "Hel Calafkaaga Membership",
    productDescription:
      "First payment $4.99, then $1 every month — full access to matches and messaging",
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
  return REGISTRATION_AMOUNT_CENTS;
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

/** One-time Checkout (premium upgrade). Registration Basic uses subscription. */
export const CHECKOUT_MODE = "payment" as const;
export const REGISTRATION_CHECKOUT_MODE = "subscription" as const;

/** Recurring membership period for Waafi / EVC (re-pay $4.99 after expiry). */
export const MEMBERSHIP_PERIOD_DAYS = 30;

export function membershipPaidUntilFrom(now = new Date()): Date {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + MEMBERSHIP_PERIOD_DAYS);
  return d;
}

/**
 * Next period end: if still active, extend from current paidUntil; otherwise from now.
 * Stripe leaves paidUntil null (subscription manages access).
 */
export function nextMembershipPaidUntil(
  currentPaidUntil: Date | null | undefined,
  now = new Date()
): Date {
  const base =
    currentPaidUntil && currentPaidUntil.getTime() > now.getTime()
      ? currentPaidUntil
      : now;
  return membershipPaidUntilFrom(base);
}
