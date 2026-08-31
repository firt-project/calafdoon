/** Pure swipe helpers — unit-tested without DOM. */

export const SWIPE_COMMIT_RATIO = 0.28;
export const SWIPE_MAX_ROTATION_DEG = 14;

export type SwipeIntent = "like" | "pass" | null;

export function swipeThresholdPx(cardWidth: number): number {
  return Math.max(72, Math.round(cardWidth * SWIPE_COMMIT_RATIO));
}

export function intentFromDeltaX(deltaX: number, threshold: number): SwipeIntent {
  if (deltaX >= threshold) return "like";
  if (deltaX <= -threshold) return "pass";
  return null;
}

export function rotationFromDeltaX(deltaX: number, cardWidth: number): number {
  if (cardWidth <= 0) return 0;
  const ratio = Math.max(-1, Math.min(1, deltaX / cardWidth));
  return ratio * SWIPE_MAX_ROTATION_DEG;
}

export function shouldCommitSwipe(
  deltaX: number,
  velocityX: number,
  threshold: number
): SwipeIntent {
  const byDistance = intentFromDeltaX(deltaX, threshold);
  if (byDistance) return byDistance;
  // Fast flick past half threshold
  if (Math.abs(velocityX) > 0.85 && Math.abs(deltaX) > threshold * 0.55) {
    return deltaX > 0 ? "like" : "pass";
  }
  return null;
}
