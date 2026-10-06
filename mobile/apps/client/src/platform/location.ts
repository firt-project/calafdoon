import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

export type DeviceLocation =
  | { ok: true; latitude: number; longitude: number; accuracy?: number }
  | { ok: false; reason: "denied" | "unavailable" | "timeout" };

const TIMEOUT_MS = 15_000;

/**
 * Ask the OS for permission and read one coarse position.
 * Never throws: callers branch on `reason` (denied → offer manual entry).
 */
export async function requestDeviceLocation(): Promise<DeviceLocation> {
  try {
    if (Capacitor.isNativePlatform()) {
      let perm = await Geolocation.checkPermissions();
      if (perm.location !== "granted" && perm.coarseLocation !== "granted") {
        perm = await Geolocation.requestPermissions({
          permissions: ["location", "coarseLocation"],
        });
      }
      if (perm.location !== "granted" && perm.coarseLocation !== "granted") {
        return { ok: false, reason: "denied" };
      }
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: false,
        timeout: TIMEOUT_MS,
        maximumAge: 5 * 60_000,
      });
      return {
        ok: true,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };
    }

    if (!("geolocation" in navigator)) return { ok: false, reason: "unavailable" };
    return await new Promise<DeviceLocation>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            ok: true,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }),
        (err) =>
          resolve({
            ok: false,
            reason:
              err.code === err.PERMISSION_DENIED
                ? "denied"
                : err.code === err.TIMEOUT
                  ? "timeout"
                  : "unavailable",
          }),
        { enableHighAccuracy: false, timeout: TIMEOUT_MS, maximumAge: 5 * 60_000 }
      );
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message.toLowerCase() : "";
    if (msg.includes("denied") || msg.includes("permission")) {
      return { ok: false, reason: "denied" };
    }
    if (msg.includes("timeout")) return { ok: false, reason: "timeout" };
    return { ok: false, reason: "unavailable" };
  }
}
