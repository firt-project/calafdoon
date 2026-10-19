import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { apiClient } from "@hel/api-client";

let currentToken: string | null = null;
let listening = false;

/** Ask permission, get the FCM token and register it with the API. Best-effort. */
export async function registerPush(
  onOpenRoute: (route: string) => void
): Promise<void> {
  // iOS push needs the Apple push entitlement + APNs key, which are not set up yet: do not show a
  // notification prompt that cannot work. Android uses Firebase Cloud Messaging.
  if (Capacitor.getPlatform() !== "android") return;
  try {
    if (!listening) {
      listening = true;
      await PushNotifications.addListener("registration", async ({ value }) => {
        currentToken = value;
        try {
          await apiClient.post("/push/register", {
            token: value,
            platform: Capacitor.getPlatform() === "ios" ? "ios" : "android",
          });
        } catch {
          /* retried on next launch */
        }
      });
      await PushNotifications.addListener("registrationError", () => {
        /* no Firebase config or permission denied */
      });
      await PushNotifications.addListener(
        "pushNotificationActionPerformed",
        (event) => {
          const route = event.notification.data?.route;
          if (typeof route === "string" && route.startsWith("/")) {
            onOpenRoute(route);
          }
        }
      );
    }
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== "granted") return;
    await PushNotifications.register();
  } catch {
    /* plugin unavailable */
  }
}

/** Stop pushes to this device for the signed-out account. Call before logout. */
export async function unregisterPush(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !currentToken) return;
  try {
    await apiClient.post("/push/unregister", { token: currentToken });
  } catch {
    /* best-effort */
  }
}
