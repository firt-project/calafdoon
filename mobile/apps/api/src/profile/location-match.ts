import { ALL_COUNTRIES } from "./countries";

const COUNTRY_ALIASES: Record<string, string> = {
  usa: "United States",
  "united states of america": "United States",
  uk: "United Kingdom",
  "great britain": "United Kingdom",
  uae: "United Arab Emirates",
  somaliland: "Somalia",
};

/** Map Nominatim country name onto our canonical list. */
export function matchCountry(detected: string): string | null {
  const trimmed = detected.trim();
  if (!trimmed) return null;

  if ((ALL_COUNTRIES as readonly string[]).includes(trimmed)) {
    return trimmed;
  }

  const lower = trimmed.toLowerCase();
  const alias = COUNTRY_ALIASES[lower];
  if (alias) return alias;

  const exact = ALL_COUNTRIES.find(
    (country) => country.toLowerCase() === lower
  );
  if (exact) return exact;

  const partial = ALL_COUNTRIES.find(
    (country) =>
      lower.includes(country.toLowerCase()) ||
      country.toLowerCase().includes(lower)
  );
  return partial ?? null;
}

/** Normalize city from reverse geocode (keep free-text when not in a list). */
export function normalizeCity(detected: string): string {
  return detected.trim().slice(0, 80);
}
