import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { registerDeepLinks } from "@/navigation/deep-links";

/** Deep links → in-app navigate (works with MemoryRouter on native). */
export function DeepLinkNavigator() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    return registerDeepLinks((path, params) => {
      const q = params.toString();
      const normalized = path.startsWith("/") ? path : `/${path}`;
      navigate(q ? `${normalized}?${q}` : normalized);
    });
  }, [navigate]);

  useEffect(() => {
    const onNav = (e: Event) => {
      const route = (e as CustomEvent<string>).detail;
      if (typeof route === "string") navigate(route);
    };
    window.addEventListener("hel:navigate", onNav);
    return () => window.removeEventListener("hel:navigate", onNav);
  }, [navigate]);

  return null;
}
