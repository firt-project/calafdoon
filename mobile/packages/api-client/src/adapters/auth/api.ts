import {
  apiClient,
  clearApiAuthStorage,
  setApiCsrfToken,
  setApiSessionToken,
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
  const mustResetPassword = Boolean(raw.mustResetPassword);
  // Absent emailVerified ⇒ treat as verified (avoid loops on older Nest).
  const emailVerified = raw.emailVerified !== false;
  const mfaEnabled = Boolean(raw.mfaEnabled);
  const mfaEnrollmentRequired = Boolean(raw.mfaEnrollmentRequired);

  return {
    ...raw,
    id: raw.id,
    email: raw.email ?? null,
    role,
    hasPaid,
    banned,
    mustResetPassword,
    emailVerified,
    mfaEnabled,
    mfaEnrollmentRequired,
    profile: {
      ...(nested ?? {}),
      role,
      hasPaid,
      banned,
      mustResetPassword,
      emailVerified,
      mfaEnabled,
      mfaEnrollmentRequired,
    },
  };
}

function toLoginResult(
  res: {
    mfaRequired?: boolean;
    mfaToken?: string;
    expiresAt?: string;
    csrfToken?: string;
    sessionToken?: string;
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
  if (res?.sessionToken) setApiSessionToken(res.sessionToken);
  if (res?.csrfToken) setApiCsrfToken(res.csrfToken);
  return {
    user: toSessionUser(res?.user as NestAuthUser) as SessionUser,
    csrfToken: res?.csrfToken,
    sessionToken: res?.sessionToken,
  };
}

export const apiAuth: AuthAdapter = {
  async getSession() {
    try {
      const res = await apiClient.get<MeResponse>("/auth/me");
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
        sessionToken?: string;
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
        sessionToken?: string;
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
        sessionToken?: string;
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
    const res = await apiClient.post<{ message?: string }>("/auth/forgot-password", {
      email,
    });
    return { ok: true, message: res?.message };
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

  async deleteAccount(password) {
    const res = await apiClient.post<{ ok: boolean; deleted?: boolean }>(
      "/auth/delete-account",
      { password, confirm: true }
    );
    clearApiAuthStorage();
    disconnectRealtime();
    return { ok: true, deleted: Boolean(res?.deleted ?? true) };
  },

  async verifyEmail(token) {
    return apiClient.post<{ ok: boolean }>("/auth/verify-email", { token });
  },

  async resendVerification() {
    return apiClient.post<{ ok: boolean }>("/auth/resend-verification", {});
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
      // Phone cold-start: one short attempt so native splash cannot hang for minutes.
      const res = await apiClient.get<MeResponse>("/auth/me", {
        timeoutMs: 15_000,
        maxAttempts: 1,
      });
      if (res?.csrfToken) setApiCsrfToken(res.csrfToken);
      return {
        user: toSessionUser(res?.user),
        accessState: res?.accessState ?? null,
        csrfToken: res?.csrfToken,
      };
    } catch (e) {
      // Unauthenticated → clear session. Network/5xx → throw so callers keep
      // the existing user (e.g. right after Stripe pay).
      const status =
        e && typeof e === "object" && "status" in e
          ? Number((e as { status: number }).status)
          : undefined;
      if (status === 401 || status === 403) {
        return { user: null, accessState: null };
      }
      throw e;
    }
  },
};
