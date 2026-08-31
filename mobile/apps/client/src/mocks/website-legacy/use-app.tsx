import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { authService } from "@/services/auth-service";
import { prefsService } from "@/storage/prefs-service";
import { storageService } from "@/storage/storage-service";
import type { AppDataStore, MemberProfile, SessionState } from "@/types";

type AppContextValue = {
  ready: boolean;
  store: AppDataStore;
  session: SessionState | null;
  profile: MemberProfile | null;
  refresh: () => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
};

const AppContext = createContext<AppContextValue | null>(null);
const THEME_KEY = "hel-calafkaaga-theme";

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [store, setStore] = useState<AppDataStore>(() => storageService.read());
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = prefsService.get(THEME_KEY);
    if (saved === "dark" || saved === "light") return saved;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      return "dark";
    }
    return "light";
  });

  const refresh = useCallback(() => {
    setStore(storageService.read());
  }, []);

  useEffect(() => {
    refresh();
    setReady(true);
    const onChange = () => refresh();
    window.addEventListener("hel:data-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("hel:data-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [refresh]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    prefsService.set(THEME_KEY, theme);
  }, [theme]);

  const session = store.session;
  const profile = session
    ? authService.getProfile(session.userId) ?? store.profiles[session.userId] ?? null
    : null;

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  const value = useMemo(
    () => ({ ready, store, session, profile, refresh, theme, toggleTheme }),
    [ready, store, session, profile, refresh, theme, toggleTheme]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export function bumpData() {
  window.dispatchEvent(new CustomEvent("hel:data-changed"));
}
