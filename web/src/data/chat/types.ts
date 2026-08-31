export type ChatAdapter = {
  getConversations(opts?: { list?: string }): Promise<unknown>;
  getPartnerProfile(conversationId: string): Promise<{
    profile: unknown;
    score?: number | null;
    matchId?: string;
    conversationId?: string;
  }>;
  getMessages(
    conversationId: string,
    opts?: { cursor?: string; limit?: number; signal?: AbortSignal }
  ): Promise<unknown>;
  sendMessage(
    conversationId: string,
    body: {
      message?: string;
      imageMediaId?: string;
      idempotencyKey?: string;
    }
  ): Promise<unknown>;
  /** Upload a chat attachment; returns the media/storage id to send. */
  uploadChatImage(
    conversationId: string,
    file: File
  ): Promise<{ mediaId: string }>;
  markAsRead(conversationId: string): Promise<unknown>;
  setTyping(conversationId: string, typing: boolean): Promise<unknown>;
  getTypingStatus(conversationId: string): Promise<unknown>;
};

export const CHAT_METHOD_NAMES = [
  "getConversations",
  "getPartnerProfile",
  "getMessages",
  "sendMessage",
  "uploadChatImage",
  "markAsRead",
  "setTyping",
  "getTypingStatus",
] as const;
