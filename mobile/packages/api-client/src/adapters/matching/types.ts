export type DiscoverPageResult = {
  items: unknown[];
  nextCursor: string | null;
};

export type MatchingAdapter = {
  getMatches(
    filters?: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<DiscoverPageResult>;
  getMyMatches(list?: string): Promise<unknown>;
  getMatchLists(filters?: Record<string, unknown>): Promise<unknown>;
  getHomeFeed(): Promise<unknown>;
  getCompatibilityBreakdown(userId: string): Promise<unknown>;
  /** Full peer dating card (no email/phone). */
  getPeerCard(userId: string): Promise<unknown>;
  getPrivateRevealStatus(matchId: string): Promise<unknown>;
  revealPrivatePhoto(matchId: string, mediaId?: string): Promise<unknown>;
  likeUser(userId: string, action?: "like" | "pass" | "shortlist"): Promise<unknown>;
  /** Open chat without requiring a reciprocal like. */
  startChat(targetUserId: string): Promise<{
    matched: boolean;
    matchId: string;
    conversationId: string;
    mutual: boolean;
  }>;
  markMatchSeen(matchId: string): Promise<unknown>;
  archiveMatch(matchId: string, archived?: boolean): Promise<unknown>;
};

export const MATCHING_METHOD_NAMES = [
  "getMatches",
  "getMyMatches",
  "getMatchLists",
  "getHomeFeed",
  "getCompatibilityBreakdown",
  "getPeerCard",
  "getPrivateRevealStatus",
  "revealPrivatePhoto",
  "likeUser",
  "startChat",
  "markMatchSeen",
  "archiveMatch",
] as const;
