/** Port of convex/lib/constants.ts matching values. */

/** Soft floor so sparse communities still see people; sorted by score descending. */
export const MIN_COMPATIBILITY_SCORE = 40;
export const MATCH_DISCOVER_LIMIT = 50;
export const MATCH_LIST_LIMIT = 100;
export const SCORE_PAGE_SIZE = 20;
/** Nest algorithm version — bump when weights change. */
export const SCORE_VERSION = 1;

export function makePairKey(userAId: string, userBId: string): string {
  return userAId < userBId
    ? `${userAId}:${userBId}`
    : `${userBId}:${userAId}`;
}

export function orderedPairIds(userAId: string, userBId: string): {
  userAId: string;
  userBId: string;
} {
  return userAId < userBId
    ? { userAId, userBId }
    : { userAId: userBId, userBId: userAId };
}
