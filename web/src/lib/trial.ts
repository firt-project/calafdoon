export const TRIAL_DAYS = 7;
export const TRIAL_DURATION_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

export type TrialProfile = {
  trialEndsAt?: number;
  hasPaid?: boolean;
  isInTrial?: boolean;
};

export function isInTrialPeriod(
  profile: TrialProfile | null | undefined,
  now = Date.now()
): boolean {
  if (profile?.isInTrial !== undefined) return profile.isInTrial;
  if (!profile?.trialEndsAt || profile.hasPaid) return false;
  return now < profile.trialEndsAt;
}

export function isTrialExpired(
  profile: TrialProfile | null | undefined,
  now = Date.now()
): boolean {
  if (!profile?.trialEndsAt || profile.hasPaid) return false;
  return now >= profile.trialEndsAt;
}

export function getTrialDaysRemaining(
  profile: TrialProfile | null | undefined,
  now = Date.now()
): number {
  if (!profile?.trialEndsAt || profile.hasPaid) return 0;
  const msLeft = profile.trialEndsAt - now;
  if (msLeft <= 0) return 0;
  return Math.ceil(msLeft / (24 * 60 * 60 * 1000));
}
