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

  return null;
}
