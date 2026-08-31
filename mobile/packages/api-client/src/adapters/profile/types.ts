export type ProfileAdapter = {
  getProfile(): Promise<unknown>;
  updateProfile(patch: Record<string, unknown>): Promise<unknown>;
  ensureProfile(): Promise<unknown>;
  completeRegistrationGender(gender: "male" | "female"): Promise<unknown>;
  getAccessState(): Promise<unknown>;
  getShareableCard(publicId: string): Promise<unknown>;
  getWali(): Promise<{ waliName: string | null; waliPhone: string | null }>;
  updateWali(data: {
    waliName?: string;
    waliPhone?: string;
  }): Promise<{ waliName: string | null; waliPhone: string | null }>;
};

export const PROFILE_METHOD_NAMES = [
  "getProfile",
  "updateProfile",
  "ensureProfile",
  "completeRegistrationGender",
  "getAccessState",
  "getShareableCard",
  "getWali",
  "updateWali",
] as const;
