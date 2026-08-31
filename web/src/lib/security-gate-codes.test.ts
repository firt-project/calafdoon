import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  routeForSecurityGateCode,
  SECURITY_GATE_CODES,
} from "./security-gate-codes";
import { getAuthErrorMessage } from "./auth-errors";
import { ApiClientError } from "@/data/api-client";

describe("security gate codes", () => {
  it("maps PASSWORD_RESET_REQUIRED to change-password", () => {
    assert.equal(
      routeForSecurityGateCode(SECURITY_GATE_CODES.PASSWORD_RESET_REQUIRED),
      "/change-password"
    );
  });

  it("maps EMAIL_VERIFICATION_REQUIRED to verify-email", () => {
    assert.equal(
      routeForSecurityGateCode(
        SECURITY_GATE_CODES.EMAIL_VERIFICATION_REQUIRED
      ),
      "/verify-email"
    );
  });

  it("maps MFA_ENROLLMENT_REQUIRED to enroll-mfa", () => {
    assert.equal(
      routeForSecurityGateCode(SECURITY_GATE_CODES.MFA_ENROLLMENT_REQUIRED),
      "/enroll-mfa"
    );
  });

  it("ignores unknown codes", () => {
    assert.equal(routeForSecurityGateCode("NOPE"), null);
    assert.equal(routeForSecurityGateCode(undefined), null);
  });
});

describe("getAuthErrorMessage security codes", () => {
  it("surfaces MFA enrollment required message", () => {
    const err = new ApiClientError({
      status: 403,
      code: SECURITY_GATE_CODES.MFA_ENROLLMENT_REQUIRED,
      message: "Staff MFA enrollment required",
    });
    const msg = getAuthErrorMessage(err, "fallback", ((k: string) =>
      k === "auth.errorMfaEnrollmentRequired"
        ? "Enable authenticator MFA before continuing."
        : k) as never);
    assert.equal(msg, "Enable authenticator MFA before continuing.");
  });

  it("surfaces rate-limit message for 429", () => {
    const err = new ApiClientError({
      status: 429,
      code: "too_many",
      message: "Too many",
    });
    const msg = getAuthErrorMessage(err, "fallback", ((k: string) =>
      k === "auth.errorTooManyAttempts" ? "Too many attempts" : k) as never);
    assert.equal(msg, "Too many attempts");
  });

  it("surfaces session-not-established after cookie round-trip failure", () => {
    const err = new ApiClientError({
      status: 401,
      code: "SESSION_NOT_ESTABLISHED",
      message: "Session could not be established",
    });
    const msg = getAuthErrorMessage(err, "fallback", ((k: string) =>
      k === "auth.sessionNotEstablished"
        ? "Could not keep you logged in"
        : k) as never);
    assert.equal(msg, "Could not keep you logged in");
  });
});
