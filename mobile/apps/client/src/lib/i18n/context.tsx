import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  deviceLocale,
  LOCALE_CHOICE_KEY,
  translate,
  type Locale,
  type TranslationPath,
} from "@/lib/i18n/translations";
import { prefsStore } from "@/platform/secure-storage";

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationPath, params?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(deviceLocale);

  useEffect(() => {
    void prefsStore.get(LOCALE_CHOICE_KEY).then((stored) => {
      if (stored === "en" || stored === "so") setLocaleState(stored);
    });
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    void prefsStore.set(LOCALE_CHOICE_KEY, next);
  }, []);

  const t = useCallback(
    (key: TranslationPath, params?: Record<string, string | number>) =>
      translate(locale, key, params),
    [locale]
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t]
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useTranslation must be within LanguageProvider");
  return ctx;
}
