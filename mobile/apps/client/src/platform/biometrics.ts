import {
  BiometricAuth,
  BiometryError,
  BiometryErrorType,
  BiometryType,
} from "@aparajita/capacitor-biometric-auth";
import { Capacitor } from "@capacitor/core";
import { prefsStore } from "@/platform/secure-storage";

const ENABLED_KEY = "hel_biometric_lock_enabled";

export type BiometricAvailability = {
  available: boolean;
  enrolled: boolean;
  label: string;
  reason?: string;
};

function labelForType(type: BiometryType): string {
  switch (type) {
    case BiometryType.faceId:
      return "Face ID";
    case BiometryType.touchId:
      return "Touch ID";
    case BiometryType.fingerprintAuthentication:
      return "Fingerprint";
    case BiometryType.faceAuthentication:
      return "Face unlock";
    case BiometryType.irisAuthentication:
      return "Iris";
    default:
      return "Biometric unlock";
  }
}

export async function getBiometricAvailability(): Promise<BiometricAvailability> {
  try {
    const info = await BiometricAuth.checkBiometry();
    return {
      available: info.isAvailable,
      enrolled: info.isAvailable,
      label: labelForType(info.biometryType),
      reason: info.isAvailable ? undefined : info.reason,
    };
  } catch (e) {
    return {
      available: false,
      enrolled: false,
      label: "Biometric unlock",
      reason: e instanceof Error ? e.message : "Unavailable",
    };
  }
}

export async function isBiometricLockEnabled(): Promise<boolean> {
  return (await prefsStore.get(ENABLED_KEY)) === "1";
}

export async function setBiometricLockEnabled(enabled: boolean): Promise<void> {
  if (enabled) await prefsStore.set(ENABLED_KEY, "1");
  else await prefsStore.remove(ENABLED_KEY);
}

export async function disableBiometricLock(): Promise<void> {
  await setBiometricLockEnabled(false);
}

export type BiometricAuthResult =
  | { ok: true }
  | { ok: false; cancelled: boolean; message: string };

export async function authenticateBiometric(reason: string): Promise<BiometricAuthResult> {
  try {
    await BiometricAuth.authenticate({
      reason,
      cancelTitle: "Cancel",
      allowDeviceCredential: true,
      iosFallbackTitle: "Use passcode",
      androidTitle: "Unlock HelCalaf",
      androidSubtitle: reason,
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof BiometryError) {
      const cancelled =
        e.code === BiometryErrorType.userCancel ||
        e.code === BiometryErrorType.userFallback ||
        e.code === BiometryErrorType.appCancel ||
        e.code === BiometryErrorType.systemCancel;
      return {
        ok: false,
        cancelled,
        message: cancelled ? "Cancelled" : "Biometric authentication failed",
      };
    }
    return {
      ok: false,
      cancelled: false,
      message: e instanceof Error ? e.message : "Biometric authentication failed",
    };
  }
}

/** Web / unsupported platforms still allow enabling for UX testing via simulated auth. */
export function biometricsSupportedOnPlatform(): boolean {
  return true;
}

export function isNativeBiometricsPlatform(): boolean {
  return Capacitor.isNativePlatform();
}
