export type ModerationAdapter = {
  blockUser(userId: string, reason?: string): Promise<unknown>;
  unblockUser(userId: string): Promise<unknown>;
  reportUser(body: {
    userId: string;
    reason: string;
    details?: string;
    alsoBlock?: boolean;
  }): Promise<unknown>;
  listMyBlocks(): Promise<unknown>;
};

export const MODERATION_METHOD_NAMES = [
  "blockUser",
  "unblockUser",
  "reportUser",
  "listMyBlocks",
] as const;
