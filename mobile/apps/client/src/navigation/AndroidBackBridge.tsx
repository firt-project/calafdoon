import { useEffect, useRef } from "react";
import {
  useLocation,
  useNavigate,
  useNavigationType,
} from "react-router-dom";
import { setAndroidBackNavigator } from "@/navigation/android-back";

/**
 * Bridges React Router navigation into the Android hardware back handler.
 * MemoryRouter (used on native) keeps its history in memory, so window.history
 * is useless — we track stack depth from navigation types instead.
 */
export function AndroidBackBridge() {
  const navigate = useNavigate();
  const navType = useNavigationType();
  const location = useLocation();
  const depth = useRef(1);

  useEffect(() => {
    if (navType === "PUSH") {
      depth.current += 1;
    } else if (navType === "POP" && depth.current > 1) {
      depth.current -= 1;
    }
    // REPLACE leaves depth unchanged.
  }, [location.key, navType]);

  useEffect(() => {
    setAndroidBackNavigator({
      back: () => navigate(-1),
      canGoBack: () => depth.current > 1,
    });
  }, [navigate]);

  return null;
}
