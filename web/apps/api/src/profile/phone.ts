/** Port of convex/lib/phone.ts */

import { isValidPhoneNumber } from "libphonenumber-js";

export function isValidContactName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 2 && trimmed !== "User";
}

export function isValidContactPhone(phone: string): boolean {
  const trimmed = phone.trim();
  if (!trimmed) return false;
  try {
    return isValidPhoneNumber(trimmed);
  } catch {
    return false;
  }
}
