/** Shared opaque id type for adapters (Convex Id or UUID string). */
export type EntityId = string;

export type AccessStateLike = {
  hasPaid?: boolean;
  approved?: boolean;
  banned?: boolean;
  reviewStatus?: string | null;
  role?: string;
  questionnaireComplete?: boolean;
  registrationComplete?: boolean;
  [key: string]: unknown;
};

export type SessionUser = {
  id: string;
  email?: string | null;
  profile?: Record<string, unknown> | null;
  accessState?: AccessStateLike | null;
  [key: string]: unknown;
};
