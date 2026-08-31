/**
 * @deprecated Local-demo only. Production auth is Nest `/auth` via @hel/api-client.
 * Guarded by VITE_USE_LOCAL_DEMO — do not use as authoritative identity.
 */
import { z } from "zod";
import { storageService } from "@/storage/storage-service";
import type {
  AppNotification,
  MemberProfile,
  Plan,
  ProfileAnswers,
  SessionState,
  UserAccount,
} from "@/types";
import { createId, hashPassword, verifyPassword } from "@/utils/crypto";

export const emailSchema = z.string().trim().email("Invalid email address");
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters");

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function emptyProfile(userId: string): MemberProfile {
  const ts = nowIso();
  return {
    userId,
    answers: {},
    photoDataUrl: null,
    questionnaireComplete: false,
    registrationComplete: false,
    plan: "none",
    accessUnlocked: false,
    createdAt: ts,
    updatedAt: ts,
  };
}

function pushNotification(
  userId: string,
  title: string,
  body: string,
  href?: string
): void {
  storageService.update((store) => {
    const note: AppNotification = {
      id: createId("notif"),
      userId,
      title,
      body,
      read: false,
      createdAt: nowIso(),
      href,
    };
    return { ...store, notifications: [note, ...store.notifications] };
  });
}

export const authService = {
  getSession(): SessionState | null {
    return storageService.read().session;
  },

  getAccount(userId: string): UserAccount | undefined {
    return storageService.read().accounts.find((a) => a.id === userId);
  },

  getProfile(userId: string): MemberProfile | undefined {
    return storageService.read().profiles[userId];
  },

  requireSession(): SessionState {
    const session = this.getSession();
    if (!session) throw new AuthError("You must sign in first.");
    return session;
  },

  async register(emailRaw: string, password: string): Promise<SessionState> {
    const email = emailSchema.parse(emailRaw).toLowerCase();
    passwordSchema.parse(password);

    const store = storageService.read();
    if (store.accounts.some((a) => a.email === email)) {
      throw new AuthError("An account with this email already exists.");
    }

    const { hash, salt } = await hashPassword(password);
    const id = createId("user");
    const ts = nowIso();
    const account: UserAccount = {
      id,
      email,
      passwordHash: hash,
      salt,
      createdAt: ts,
      updatedAt: ts,
    };
    const session: SessionState = { userId: id, email, createdAt: ts };

    storageService.write({
      ...store,
      accounts: [...store.accounts, account],
      profiles: { ...store.profiles, [id]: emptyProfile(id) },
      session,
    });

    pushNotification(
      id,
      "Welcome to Hel Calafkaaga",
      "Complete your profile to start discovering matches.",
      "/register/details"
    );

    return session;
  },

  async login(emailRaw: string, password: string): Promise<SessionState> {
    const email = emailSchema.parse(emailRaw).toLowerCase();
    passwordSchema.parse(password);
    const store = storageService.read();
    const account = store.accounts.find((a) => a.email === email);
    if (!account) throw new AuthError("Invalid email or password");
    const ok = await verifyPassword(password, account.passwordHash, account.salt);
    if (!ok) throw new AuthError("Invalid email or password");

    const session: SessionState = {
      userId: account.id,
      email: account.email,
      createdAt: nowIso(),
    };
    storageService.write({ ...store, session });
    return session;
  },

  logout(): void {
    storageService.update((store) => ({ ...store, session: null }));
  },

  async resetPassword(emailRaw: string, newPassword: string): Promise<void> {
    const email = emailSchema.parse(emailRaw).toLowerCase();
    passwordSchema.parse(newPassword);
    const store = storageService.read();
    const idx = store.accounts.findIndex((a) => a.email === email);
    if (idx < 0) {
      throw new AuthError("No local account found for that email.");
    }
    const { hash, salt } = await hashPassword(newPassword);
    const accounts = [...store.accounts];
    accounts[idx] = {
      ...accounts[idx],
      passwordHash: hash,
      salt,
      updatedAt: nowIso(),
    };
    storageService.write({ ...store, accounts });
  },

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    passwordSchema.parse(newPassword);
    const store = storageService.read();
    const idx = store.accounts.findIndex((a) => a.id === userId);
    if (idx < 0) throw new AuthError("Account not found.");
    const account = store.accounts[idx];
    const ok = await verifyPassword(
      currentPassword,
      account.passwordHash,
      account.salt
    );
    if (!ok) throw new AuthError("Current password is incorrect.");
    const { hash, salt } = await hashPassword(newPassword);
    const accounts = [...store.accounts];
    accounts[idx] = {
      ...account,
      passwordHash: hash,
      salt,
      updatedAt: nowIso(),
    };
    storageService.write({ ...store, accounts });
  },

  setGender(userId: string, gender: "male" | "female"): MemberProfile {
    return this.patchProfile(userId, {
      answers: { gender },
      registrationComplete: true,
    });
  },

  patchProfile(
    userId: string,
    patch: Partial<MemberProfile> & { answers?: ProfileAnswers }
  ): MemberProfile {
    const store = storageService.read();
    const current = store.profiles[userId] ?? emptyProfile(userId);
    const next: MemberProfile = {
      ...current,
      ...patch,
      answers: { ...current.answers, ...(patch.answers ?? {}) },
      updatedAt: nowIso(),
    };
    storageService.write({
      ...store,
      profiles: { ...store.profiles, [userId]: next },
    });
    return next;
  },

  saveQuestionnaire(
    userId: string,
    answers: ProfileAnswers,
    photoDataUrl?: string | null
  ): MemberProfile {
    return this.patchProfile(userId, {
      answers,
      photoDataUrl: photoDataUrl === undefined ? undefined : photoDataUrl,
      questionnaireComplete: true,
    });
  },

  unlockPlan(userId: string, plan: Exclude<Plan, "none">): MemberProfile {
    const profile = this.patchProfile(userId, {
      plan,
      accessUnlocked: true,
    });
    pushNotification(
      userId,
      "Access unlocked",
      `Your ${plan} plan is active on this device. Discover matches anytime offline.`,
      "/matches"
    );
    return profile;
  },

  getHomeRoute(userId: string): string {
    const profile = this.getProfile(userId);
    if (!profile?.registrationComplete || !profile.answers.gender) {
      return "/register/details";
    }
    if (!profile.questionnaireComplete) return "/questionnaire";
    if (!profile.accessUnlocked) return "/payment";
    return "/dashboard";
  },
};
