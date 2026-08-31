import type { AccessStateLike, SessionUser } from "../types";

export type LoginSessionResult = {
  mfaRequired?: false;
  user: SessionUser;
  csrfToken?: string;
};

export type LoginMfaChallengeResult = {
  mfaRequired: true;
  mfaToken: string;
  expiresAt: string;
};

export type LoginResult = LoginSessionResult | LoginMfaChallengeResult;

export type MfaStatus = {
  eligible: boolean;
  required: boolean;
  enabled: boolean;
  enabledAt: string | null;
  pendingEnrollment: boolean;
  recoveryCodesRemaining: number;
};

export type MfaEnrollStartResult = {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
};

export type AuthAdapter = {
  getSession(): Promise<SessionUser | null>;
  getCurrentUser(): Promise<SessionUser | null>;
  login(email: string, password: string): Promise<LoginResult>;
  verifyMfaLogin(mfaToken: string, code: string): Promise<LoginResult>;
  register(email: string, password: string): Promise<LoginResult>;
  /** Explicit availability for register UI (inverted isEmailRegistered). */
  checkEmail(email: string): Promise<{ available: boolean }>;
  logout(): Promise<void>;
  logoutAll(): Promise<void>;
  forgotPassword(email: string): Promise<{
    message: string;
    ok: boolean;
  }>;
  resetPassword(token: string, newPassword: string): Promise<{ ok: boolean }>;
  changePassword(
    currentPassword: string,
    newPassword: string
  ): Promise<{ ok: boolean }>;
  mfaStatus(): Promise<MfaStatus>;
  mfaEnrollStart(): Promise<MfaEnrollStartResult>;
  mfaEnrollConfirm(code: string): Promise<{ ok: boolean; recoveryCodes: string[] }>;
  mfaEnrollCancel(): Promise<{ ok: boolean }>;
  mfaDisable(password: string, code: string): Promise<{ ok: boolean }>;
  mfaRegenerateRecovery(
    code: string
  ): Promise<{ ok: boolean; recoveryCodes: string[] }>;
  bootstrapMe(): Promise<{
    user: SessionUser | null;
    accessState: AccessStateLike | null;
    csrfToken?: string;
  }>;
};

export const AUTH_METHOD_NAMES = [
  "getSession",
  "getCurrentUser",
  "login",
  "verifyMfaLogin",
  "register",
  "checkEmail",
  "logout",
  "logoutAll",
  "forgotPassword",
  "resetPassword",
  "changePassword",
  "mfaStatus",
  "mfaEnrollStart",
  "mfaEnrollConfirm",
  "mfaEnrollCancel",
  "mfaDisable",
  "mfaRegenerateRecovery",
  "bootstrapMe",
] as const;
