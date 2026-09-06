import { App as CapApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

let lastBackAt = 0;

// The app runs on MemoryRouter natively, so window.history is not the source of
// truth. <AndroidBackBridge/> injects React Router's navigation here.
let routerBack: (() => void) | null = null;
let routerCanGoBack: () => boolean = () => false;

export function setAndroidBackNavigator(opts: {
  back: () => void;
  canGoBack: () => boolean;
}): void {
  routerBack = opts.back;
  routerCanGoBack = opts.canGoBack;
}

/**
 * Android hardware back / swipe-back:
 * 1) close an open dialog
 * 2) React Router back when there is somewhere to go
 * 3) at the root, require a second press within 2s to exit the app
 */
export function registerAndroidBackHandler(): () => void {
  if (!Capacitor.isNativePlatform()) return () => undefined;

  const sub = CapApp.addListener("backButton", () => {
    const dialogOpen = document.querySelector("[data-dialog-open='true']");
    if (dialogOpen) {
      dialogOpen.dispatchEvent(new CustomEvent("request-close"));
      return;
    }

    if (routerCanGoBack()) {
      routerBack?.();
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
