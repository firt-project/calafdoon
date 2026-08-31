import { ALL_COUNTRIES } from "./countries";
import { getCitiesForCountry } from "./constants";

const COUNTRY_ALIASES: Record<string, string> = {
  usa: "United States",
  "united states of america": "United States",
  uk: "United Kingdom",
  "great britain": "United Kingdom",
  uae: "United Arab Emirates",
  somaliland: "Somalia",
};

export function matchCountry(detected: string): string | null {
  const trimmed = detected.trim();
  if (!trimmed) return null;

  if ((ALL_COUNTRIES as readonly string[]).includes(trimmed)) {
    return trimmed;
  }

  const lower = trimmed.toLowerCase();
  const alias = COUNTRY_ALIASES[lower];
  if (alias) return alias;

  const exact = ALL_COUNTRIES.find((country) => country.toLowerCase() === lower);
  if (exact) return exact;

  const partial = ALL_COUNTRIES.find(
    (country) =>
      lower.includes(country.toLowerCase()) ||
      country.toLowerCase().includes(lower)
  );
  return partial ?? null;
}

export function matchCity(country: string, detected: string): string {
  const trimmed = detected.trim();
  if (!trimmed) return "";

  const cities = getCitiesForCountry(country);
  if (!cities.length) return trimmed;

  const lower = trimmed.toLowerCase();
  const exact = cities.find((city) => city.toLowerCase() === lower);
  if (exact) return exact;

  const partial = cities.find(
    (city) =>
      lower.includes(city.toLowerCase()) || city.toLowerCase().includes(lower)
  );
  if (partial) return partial;

  return trimmed;
}

export function cityOptionsWithDetected(
  country: string,
  detectedCity: string
): string[] {
  const cities = getCitiesForCountry(country);
  if (!detectedCity.trim()) return cities;
  if (!cities.length) return [];
  if (cities.some((city) => city.toLowerCase() === detectedCity.toLowerCase())) {
    return cities;
  }
  return [detectedCity, ...cities];
}
