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
      replyToId?: string;
    }
  ): Promise<unknown>;
  /** Upload a chat attachment; returns the media/storage id to send. */
  uploadChatImage(
    conversationId: string,
    file: File
  ): Promise<{ mediaId: string }>;
  /** Edit one of my own text messages (15 minutes). */
  editMessage(conversationId: string, messageId: string, message: string): Promise<unknown>;
  /** Delete one of my own messages for everyone. */
  deleteMessage(conversationId: string, messageId: string): Promise<unknown>;
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
  "editMessage",
  "deleteMessage",
  "markAsRead",
  "setTyping",
  "getTypingStatus",
] as const;
