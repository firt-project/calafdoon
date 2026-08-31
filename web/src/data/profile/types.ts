export type ProfileAdapter = {
  getProfile(): Promise<unknown>;
  updateProfile(patch: Record<string, unknown>): Promise<unknown>;
  ensureProfile(): Promise<unknown>;
  completeRegistrationGender(gender: "male" | "female"): Promise<unknown>;
  getAccessState(): Promise<unknown>;
  deleteAccount(password: string): Promise<unknown>;
};

export const PROFILE_METHOD_NAMES = [
  "getProfile",
  "updateProfile",
  "ensureProfile",
  "completeRegistrationGender",
  "getAccessState",
  "deleteAccount",
] as const;
