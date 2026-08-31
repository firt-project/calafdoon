export type MatchingAdapter = {
  getMatches(
    filters?: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<unknown>;
  getMyMatches(list?: string): Promise<unknown>;
  getMatchLists(filters?: Record<string, unknown>): Promise<unknown>;
  getHomeFeed(): Promise<unknown>;
  getCompatibilityBreakdown(userId: string): Promise<unknown>;
  getPrivateRevealStatus(matchId: string): Promise<unknown>;
  revealPrivatePhoto(matchId: string, mediaId?: string): Promise<unknown>;
  likeUser(userId: string, action?: "like" | "pass" | "shortlist"): Promise<unknown>;
  startChat(targetUserId: string): Promise<unknown>;
  markMatchSeen(matchId: string): Promise<unknown>;
  archiveMatch(matchId: string, archived?: boolean): Promise<unknown>;
};

export const MATCHING_METHOD_NAMES = [
  "getMatches",
  "getMyMatches",
  "getMatchLists",
  "getHomeFeed",
  "getCompatibilityBreakdown",
  "getPrivateRevealStatus",
  "revealPrivatePhoto",
  "likeUser",
  "startChat",
  "markMatchSeen",
  "archiveMatch",
] as const;
