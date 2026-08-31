const TRIAL_WELCOME_KEY = "hel-calafkaaga-trial-welcome-seen";

function storageKey(userId?: string) {
  return userId ? `${TRIAL_WELCOME_KEY}:${userId}` : TRIAL_WELCOME_KEY;
}

export function hasSeenTrialWelcomeNotice(userId?: string): boolean {
  if (typeof window === "undefined" || !userId) return false;
  try {
    return localStorage.getItem(storageKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function markTrialWelcomeNoticeSeen(userId?: string): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    localStorage.setItem(storageKey(userId), "1");
  } catch {
    // ignore quota / private mode
  }
}
