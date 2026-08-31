export type SupportAdapter = {
  listMine(): Promise<unknown>;
  getMine(contactId: string): Promise<unknown>;
  create(body: Record<string, unknown>): Promise<unknown>;
  replyAsMember(contactId: string, message: string): Promise<unknown>;
  admin: {
    list(opts?: Record<string, unknown>): Promise<unknown>;
    get(contactId: string): Promise<unknown>;
    reply(contactId: string, message: string): Promise<unknown>;
    updateStatus(contactId: string, status: string): Promise<unknown>;
  };
  /** Public marketing contact — Nest may not expose; Convex uses contact action. */
  sendPublicContact(body: Record<string, unknown>): Promise<unknown>;
};

export const SUPPORT_METHOD_NAMES = [
  "listMine",
  "getMine",
  "create",
  "replyAsMember",
  "sendPublicContact",
] as const;
