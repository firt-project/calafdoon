import { prefsStore } from "@/platform/secure-storage";

const PREFIX = "hel_chat_draft_v1";

function key(userId: string, conversationId: string): string {
  return `${PREFIX}:${userId}:${conversationId}`;
}

export async function loadChatDraft(
  userId: string | null | undefined,
  conversationId: string
): Promise<string> {
  if (!userId || !conversationId) return "";
  return (await prefsStore.get(key(userId, conversationId))) ?? "";
}

export async function saveChatDraft(
  userId: string | null | undefined,
  conversationId: string,
  text: string
): Promise<void> {
  if (!userId || !conversationId) return;
  const trimmed = text.trimEnd();
  if (!trimmed) {
    await prefsStore.remove(key(userId, conversationId));
    return;
  }
  await prefsStore.set(key(userId, conversationId), text.slice(0, 4000));
}

export async function clearChatDraft(
  userId: string | null | undefined,
  conversationId: string
): Promise<void> {
  if (!userId || !conversationId) return;
  await prefsStore.remove(key(userId, conversationId));
}

/** Best-effort clear of known draft keys for the current user (logout / delete). */
export async function clearAllChatDraftsForUser(
  userId: string | null | undefined
): Promise<void> {
  if (!userId) return;
  // Preferences API has no namespace scan on all platforms — clear marker + rely on
  // overwrite keys being unused after logout. We also store an index.
  const indexKey = `${PREFIX}:index:${userId}`;
  const raw = await prefsStore.get(indexKey);
  if (raw) {
    try {
      const ids = JSON.parse(raw) as string[];
      if (Array.isArray(ids)) {
        await Promise.all(
          ids.map((id) => prefsStore.remove(key(userId, id)))
        );
      }
    } catch {
      /* ignore */
    }
  }
  await prefsStore.remove(indexKey);
}

export async function rememberDraftConversation(
  userId: string,
  conversationId: string
): Promise<void> {
  const indexKey = `${PREFIX}:index:${userId}`;
  const raw = await prefsStore.get(indexKey);
  let ids: string[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) ids = parsed.map(String);
    } catch {
      ids = [];
    }
  }
  if (!ids.includes(conversationId)) {
    ids = [...ids, conversationId].slice(-40);
    await prefsStore.set(indexKey, JSON.stringify(ids));
  }
}
