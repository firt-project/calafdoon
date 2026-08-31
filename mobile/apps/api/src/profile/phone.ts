/** Port of convex/lib/phone.ts — accepts E.164 and common SO/KE local formats. */

import { parsePhoneNumberFromString } from "libphonenumber-js";

export function isValidContactName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 2 && trimmed !== "User";
}

/**
 * Normalize to E.164 when possible.
 * Accepts `+252…`, `252…`, and local Somalia/Kenya mobiles (e.g. `0612345678`).
 */
export function normalizeContactPhone(phone: string): string | null {
  const trimmed = phone.trim();
  if (!trimmed) return null;
  try {
    const international = parsePhoneNumberFromString(trimmed);
    if (international?.isValid()) return international.format("E.164");

    const digits = trimmed.replace(/\D/g, "");
    if (/^252\d{8,9}$/.test(digits) || /^254\d{8,9}$/.test(digits)) {
      const withPlus = parsePhoneNumberFromString(`+${digits}`);
      if (withPlus?.isValid()) return withPlus.format("E.164");
    }

    // Local mobiles: 06… → Somalia first; 07… → Kenya first (common market formats).
    const digitsOnly = trimmed.replace(/\D/g, "");
    const regions: Array<"SO" | "KE"> = /^0?7\d{8}$/.test(digitsOnly)
      ? ["KE", "SO"]
      : /^0?6\d{8}$/.test(digitsOnly)
        ? ["SO", "KE"]
        : ["SO", "KE"];

    for (const region of regions) {
      const local = parsePhoneNumberFromString(trimmed, region);
      if (local?.isValid()) return local.format("E.164");
    }
    return null;
  } catch {
    return null;
  }
}

export function isValidContactPhone(phone: string): boolean {
  return normalizeContactPhone(phone) != null;
}
