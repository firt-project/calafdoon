import { App as CapApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

let lastBackAt = 0;

/**
 * Android hardware back:
 * 1) history back when possible
 * 2) at root, require second press within 2s to exit
 */
export function registerAndroidBackHandler(): () => void {
  if (!Capacitor.isNativePlatform()) return () => undefined;

  const sub = CapApp.addListener("backButton", ({ canGoBack }) => {
    const dialogOpen = document.querySelector("[data-dialog-open='true']");
    if (dialogOpen) {
      dialogOpen.dispatchEvent(new CustomEvent("request-close"));
      return;
    }
    if (canGoBack || window.history.length > 1) {
      window.history.back();
      return;
    }
    const now = Date.now();
    if (now - lastBackAt < 2000) {
      void CapApp.exitApp();
      return;
    }
    lastBackAt = now;
  });

  return () => {
    void sub.then((h) => h.remove());
  };
}
