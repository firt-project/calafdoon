export type ChatAdapter = {
  getConversations(opts?: { list?: string }): Promise<unknown>;
  getConversation(conversationId: string): Promise<unknown>;
  /** Full public partner profile for a conversation (no email/phone). */
  getPartner(conversationId: string): Promise<unknown>;
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
  "getConversation",
  "getPartner",
  "getMessages",
  "sendMessage",
  "uploadChatImage",
  "markAsRead",
  "setTyping",
  "getTypingStatus",
] as const;
