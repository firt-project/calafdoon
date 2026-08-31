/**
 * One email → one account helpers.
 * Matching is always on trim+lowercase (see normalizeEmail).
 */

export type EmailIdentityProfile = {
  hasPaid?: boolean | null;
  questionnaireComplete?: boolean | null;
  registrationComplete?: boolean | null;
  banned?: boolean | null;
  role?: string | null;
};

export type EmailIdentityCandidate = {
  id: string;
  createdAt: Date;
  email?: string | null;
  emailNormalized?: string | null;
  profile: EmailIdentityProfile | null;
  authAccountCount?: number;
};

/** Higher score = keep this account when duplicates share an email. */
export function emailIdentityScore(user: EmailIdentityCandidate): number {
  const p = user.profile;
  let score = 0;
  if (p?.hasPaid) score += 1000;
  if (p?.role === "owner") score += 500;
  if (p?.role === "admin") score += 400;
  if (p?.questionnaireComplete) score += 100;
  if (p?.registrationComplete) score += 50;
  if ((user.authAccountCount ?? 0) > 0) score += 20;
  if (p?.banned) score -= 200;
  return score;
}

/** Pick the single account to keep for a normalized email. */
export function pickCanonicalEmailUser<T extends EmailIdentityCandidate>(
  users: T[]
): T | null {
  if (users.length === 0) return null;
  return [...users].sort((a, b) => {
    const scoreDiff = emailIdentityScore(b) - emailIdentityScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0]!;
}

export function emailMatchWhere(emailNormalized: string) {
  return {
    OR: [
      { emailNormalized },
      { email: { equals: emailNormalized, mode: "insensitive" as const } },
    ],
  };
}
