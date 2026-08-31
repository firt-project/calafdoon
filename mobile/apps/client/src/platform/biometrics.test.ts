import { describe, expect, it, vi, beforeEach } from "vitest";

const authenticate = vi.fn();
const checkBiometry = vi.fn(async () => ({
  isAvailable: false,
  biometryType: 0,
  reason: "Not enrolled",
}));

vi.mock("@aparajita/capacitor-biometric-auth", () => {
  class BiometryError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    BiometricAuth: {
      checkBiometry,
      authenticate,
    },
    BiometryError,
    BiometryErrorType: {
      userCancel: "userCancel",
      userFallback: "userFallback",
      appCancel: "appCancel",
      systemCancel: "systemCancel",
    },
    BiometryType: {
      none: 0,
      touchId: 1,
      faceId: 2,
      fingerprintAuthentication: 3,
      faceAuthentication: 4,
      irisAuthentication: 5,
    },
  };
});

describe("biometrics helpers", () => {
  beforeEach(() => {
    authenticate.mockReset();
    checkBiometry.mockReset();
    checkBiometry.mockResolvedValue({
      isAvailable: false,
      biometryType: 0,
      reason: "Not enrolled",
    });
    vi.resetModules();
  });

  it("reports unavailable devices", async () => {
    const { getBiometricAvailability } = await import("@/platform/biometrics");
    const info = await getBiometricAvailability();
    expect(info.available).toBe(false);
    expect(info.reason).toBeTruthy();
  });

  it("maps cancelled authentication", async () => {
    const { BiometryError, BiometryErrorType } = await import(
      "@aparajita/capacitor-biometric-auth"
    );
    authenticate.mockRejectedValueOnce(
      new BiometryError("cancel", BiometryErrorType.userCancel)
    );
    const { authenticateBiometric } = await import("@/platform/biometrics");
    const result = await authenticateBiometric("test");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.cancelled).toBe(true);
  });

  it("succeeds when plugin resolves", async () => {
    authenticate.mockResolvedValueOnce(undefined);
    const { authenticateBiometric } = await import("@/platform/biometrics");
    const result = await authenticateBiometric("test");
    expect(result.ok).toBe(true);
  });
});
