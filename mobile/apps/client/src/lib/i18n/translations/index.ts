import { en } from "./en";
import { so } from "./so";

export type Locale = "so" | "en";

export const defaultLocale: Locale = "so";
/** @deprecated App shell follows the user language preference (SO/EN toggle). */
export const appShellLocale: Locale = "en";
export const LOCALE_STORAGE_KEY = "calaf-locale";

export const translations = {
  en,
  so,
} as const;

export type Translations = {
  [K in keyof typeof en]: {
    [P in keyof (typeof en)[K]]: string;
  };
};

type NestedKeyOf<T, Prefix extends string = ""> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends object
        ? NestedKeyOf<T[K], `${Prefix}${K}.`>
        : `${Prefix}${K}`;
    }[keyof T & string]
  : never;

export type TranslationPath = NestedKeyOf<Translations>;

function getNestedValue(obj: unknown, path: string): string | undefined {
  const value = path.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object" && part in acc) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
  return typeof value === "string" ? value : undefined;
}

export function translate(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>
): string {
  const value =
    getNestedValue(translations[locale], key) ??
    getNestedValue(translations.en, key) ??
    key;

  if (!params) return value;

  return Object.entries(params).reduce(
    (result, [paramKey, paramValue]) =>
      result.split(`{{${paramKey}}}`).join(String(paramValue)),
    value
  );
}
