import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";

/**
 * Edge-to-edge WebView so CSS env(safe-area-inset-*) is non-zero on device.
 * Falls back silently on web.
 */
export async function configureNativeChrome(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setStyle({ style: Style.Light });
    await StatusBar.setBackgroundColor({ color: "#00000000" });
  } catch {
    /* plugin unavailable in some builds */
  }
}
