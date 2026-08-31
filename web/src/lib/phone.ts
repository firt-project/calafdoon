import { isValidPhoneNumber } from "libphonenumber-js";
import type { Country } from "react-phone-number-input";

/** Map profile country names to ISO codes for the phone country picker. */
const PROFILE_COUNTRY_TO_ISO: Record<string, Country> = {
  Somalia: "SO",
  Kenya: "KE",
  Ethiopia: "ET",
  Djibouti: "DJ",
  "United Kingdom": "GB",
  "United States": "US",
  Canada: "CA",
  Sweden: "SE",
  Norway: "NO",
  Finland: "FI",
  Denmark: "DK",
  Netherlands: "NL",
  Germany: "DE",
  France: "FR",
  Italy: "IT",
  Spain: "ES",
  Belgium: "BE",
  Switzerland: "CH",
  Austria: "AT",
  Ireland: "IE",
  Australia: "AU",
  "New Zealand": "NZ",
  "United Arab Emirates": "AE",
  "Saudi Arabia": "SA",
  Qatar: "QA",
  Kuwait: "KW",
  Bahrain: "BH",
  Oman: "OM",
  Egypt: "EG",
  Sudan: "SD",
  Turkey: "TR",
  Malaysia: "MY",
  Indonesia: "ID",
  Pakistan: "PK",
  India: "IN",
  Bangladesh: "BD",
  Nigeria: "NG",
  "South Africa": "ZA",
};

export function phoneDefaultCountry(profileCountry?: string): Country {
  if (!profileCountry) return "SO";
  return PROFILE_COUNTRY_TO_ISO[profileCountry] ?? "SO";
}

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

export function normalizePhoneForStorage(phone: string): string {
  return phone.trim();
}
