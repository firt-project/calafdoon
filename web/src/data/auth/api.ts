import {
  apiClient,
  clearApiAuthStorage,
  setApiCsrfToken,
} from "../api-client";
import { disconnectRealtime } from "../realtime/socket-client";
import { track } from "../telemetry";
import type { AccessStateLike, SessionUser } from "../types";
import type {
  AuthAdapter,
  LoginResult,
  MfaEnrollStartResult,
  MfaStatus,
} from "./types";

type NestAuthUser = {
  id: string;
  email?: string | null;
  emailNormalized?: string | null;
  role?: string;
  banned?: boolean;
  hasProfile?: boolean;
  hasPaid?: boolean;
  mustResetPassword?: boolean;
  emailVerified?: boolean;
  mfaEnabled?: boolean;
  mfaEnrollmentRequired?: boolean;
  profile?: Record<string, unknown> | null;
  [key: string]: unknown;
};

type MeResponse = {
  user: NestAuthUser;
  accessState?: AccessStateLike;
  csrfToken?: string;
};

/**
 * Nest returns a flat auth user (`role` / `hasPaid` on the root).
 * The UI expects Convex-shaped `user.profile.role` for staff routing.
 */
function toSessionUser(raw: NestAuthUser | null | undefined): SessionUser | null {
  if (!raw?.id) return null;
  const nested = (raw.profile as Record<string, unknown> | null | undefined) ?? null;
  const role =
    (typeof nested?.role === "string" ? nested.role : undefined) ??
    (typeof raw.role === "string" ? raw.role : "user");
  const hasPaid =
    typeof nested?.hasPaid === "boolean"
      ? nested.hasPaid
      : Boolean(raw.hasPaid);
  const banned =
    typeof nested?.banned === "boolean" ? nested.banned : Boolean(raw.banned);

  return {
    ...raw,
    id: raw.id,
    email: raw.email ?? null,
    role,
    hasPaid,
    banned,
    mustResetPassword: Boolean(raw.mustResetPassword),
    emailVerified: raw.emailVerified !== false,
    mfaEnabled: Boolean(raw.mfaEnabled),
    mfaEnrollmentRequired: Boolean(raw.mfaEnrollmentRequired),
    profile: {
      ...(nested ?? {}),
      role,
      hasPaid,
      banned,
      mustResetPassword: Boolean(raw.mustResetPassword),
      emailVerified: raw.emailVerified !== false,
      mfaEnabled: Boolean(raw.mfaEnabled),
      mfaEnrollmentRequired: Boolean(raw.mfaEnrollmentRequired),
    },
  };
}

function toLoginResult(
  res: {
    mfaRequired?: boolean;
    mfaToken?: string;
    expiresAt?: string;
    csrfToken?: string;
    user?: NestAuthUser;
  } | null
): LoginResult {
  if (res?.mfaRequired && res.mfaToken) {
    clearApiAuthStorage();
    return {
      mfaRequired: true,
      mfaToken: res.mfaToken,
      expiresAt: res.expiresAt ?? "",
    };
  }
  // H5: session is HttpOnly cookie only — never persist a session token.
  clearApiAuthStorage();
  if (res?.csrfToken) setApiCsrfToken(res.csrfToken);
  return {
    user: toSessionUser(res?.user as NestAuthUser) as SessionUser,
    csrfToken: res?.csrfToken,
  };
}

export const apiAuth: AuthAdapter = {
  async getSession() {
    try {
      const res = await apiClient.get<MeResponse>("/auth/me");
      // Keep the stored CSRF token in sync with the cookie the API holds.
      if (res?.csrfToken) setApiCsrfToken(res.csrfToken);
      return toSessionUser(res?.user);
    } catch {
      return null;
    }
  },

  async getCurrentUser() {
    return this.getSession();
  },

  async login(email, password) {
    try {
      const res = await apiClient.post<{
        mfaRequired?: boolean;
        mfaToken?: string;
        expiresAt?: string;
        csrfToken?: string;
        user?: NestAuthUser;
      }>("/auth/login", { email, password });
      return toLoginResult(res);
    } catch (e) {
      track("login_failure", { status: (e as { status?: number })?.status });
      throw e;
    }
  },

  async verifyMfaLogin(mfaToken, code) {
    try {
      const res = await apiClient.post<{
        csrfToken?: string;
        user?: NestAuthUser;
      }>("/auth/mfa/verify-login", { mfaToken, code });
      return toLoginResult(res);
    } catch (e) {
      track("login_failure", {
        status: (e as { status?: number })?.status,
      });
      throw e;
    }
  },

  async register(email, password) {
    try {
      const res = await apiClient.post<{
        csrfToken?: string;
        user?: NestAuthUser;
      }>("/auth/register", { email, password });
      return toLoginResult(res);
    } catch (e) {
      track("register_failure", { status: (e as { status?: number })?.status });
      throw e;
    }
  },

  async checkEmail(email) {
    return apiClient.post<{ available: boolean }>("/auth/register/check-email", {
      email,
    });
  },

  async logout() {
    try {
      await apiClient.post("/auth/logout", {});
    } finally {
      clearApiAuthStorage();
      disconnectRealtime();
    }
  },

  async logoutAll() {
    try {
      await apiClient.post("/auth/logout-all", {});
    } finally {
      clearApiAuthStorage();
      disconnectRealtime();
    }
  },

  async forgotPassword(email) {
    const res = await apiClient.post<{
      message?: string;
    }>("/auth/forgot-password", { email });
    const message = res?.message ?? "";
    // M2: API always returns the same body; treat HTTP 200 as success.
    return {
      message,
      ok: true,
    };
  },

  async resetPassword(token, newPassword) {
    await apiClient.post("/auth/reset-password", {
      token,
      newPassword,
    });
    return { ok: true };
  },

  async changePassword(currentPassword, newPassword) {
    return apiClient.post<{ ok: boolean }>("/auth/change-password", {
      currentPassword,
      newPassword,
    });
  },

  async mfaStatus() {
    return apiClient.get<MfaStatus>("/auth/mfa/status");
  },

  async mfaEnrollStart() {
    return apiClient.post<MfaEnrollStartResult>("/auth/mfa/enroll/start", {});
  },

  async mfaEnrollConfirm(code) {
    return apiClient.post<{ ok: boolean; recoveryCodes: string[] }>(
      "/auth/mfa/enroll/confirm",
      { code }
    );
  },

  async mfaEnrollCancel() {
    return apiClient.post<{ ok: boolean }>("/auth/mfa/enroll/cancel", {});
  },

  async mfaDisable(password, code) {
    return apiClient.post<{ ok: boolean }>("/auth/mfa/disable", {
      password,
      code,
    });
  },

  async mfaRegenerateRecovery(code) {
    return apiClient.post<{ ok: boolean; recoveryCodes: string[] }>(
      "/auth/mfa/recovery/regenerate",
      { code }
    );
  },

  async bootstrapMe() {
    try {
      const res = await apiClient.get<MeResponse>("/auth/me");
      if (res?.csrfToken) setApiCsrfToken(res.csrfToken);
      return {
        user: toSessionUser(res?.user),
        accessState: res?.accessState ?? null,
        csrfToken: res?.csrfToken,
      };
    } catch {
      return { user: null, accessState: null };
    }
  },
};
