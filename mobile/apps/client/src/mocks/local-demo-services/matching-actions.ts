/**
 * @deprecated Local-demo only. Production auth is Nest `/auth` via @hel/api-client.
 * Guarded by VITE_USE_LOCAL_DEMO — do not use as authoritative identity.
 */
import { storageService } from "@/storage/storage-service";
import type {
  AppNotification,
  ChatMessage,
  LikeAction,
  MatchRecord,
  Reaction,
} from "@/types";
import { createId } from "@/utils/crypto";
import { getPeerById } from "@/services/matching-service";

function nowIso(): string {
  return new Date().toISOString();
}

function notify(
  userId: string,
  title: string,
  body: string,
  href?: string
): void {
  storageService.update((store) => {
    const note: AppNotification = {
      id: createId("notif"),
      userId,
      title,
      body,
      read: false,
      createdAt: nowIso(),
      href,
    };
    return { ...store, notifications: [note, ...store.notifications] };
  });
}

/** Seed peers "like back" for a deterministic mutual match demo. */
const AUTO_MUTUAL_PEER_IDS = new Set([
  "peer_aisha",
  "peer_fatima",
  "peer_yusuf",
  "peer_omar",
]);

export const matchingActions = {
  getReactions(userId: string): Reaction[] {
    return storageService.read().reactions.filter((r) => r.fromUserId === userId);
  },

  getMatches(userId: string): MatchRecord[] {
    return storageService
      .read()
      .matches.filter((m) => m.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  react(userId: string, peerId: string, action: LikeAction): MatchRecord | null {
    if (!getPeerById(peerId)) {
      throw new Error("Profile not found.");
    }

    let createdMatch: MatchRecord | null = null;

    storageService.update((store) => {
      const reactions = store.reactions.filter(
        (r) => !(r.fromUserId === userId && r.toPeerId === peerId)
      );
      reactions.push({
        fromUserId: userId,
        toPeerId: peerId,
        action,
        createdAt: nowIso(),
      });

      let matches = store.matches;
      let messages = store.messages;
      let notifications = store.notifications;

      if (action === "like" && AUTO_MUTUAL_PEER_IDS.has(peerId)) {
        const existing = matches.find(
          (m) => m.userId === userId && m.peerId === peerId
        );
        if (!existing) {
          const match: MatchRecord = {
            id: createId("match"),
            userId,
            peerId,
            createdAt: nowIso(),
            seen: false,
          };
          matches = [match, ...matches];
          createdMatch = match;
          const peer = getPeerById(peerId);
          const welcome: ChatMessage = {
            id: createId("msg"),
            matchId: match.id,
            sender: "peer",
            body: `Assalamu alaikum! I'm ${peer?.displayName ?? "your match"}. Nice to connect on Hel Calafkaaga.`,
            createdAt: nowIso(),
          };
          messages = [welcome, ...messages];
          notifications = [
            {
              id: createId("notif"),
              userId,
              title: "It's a match!",
              body: `You and ${peer?.displayName ?? "someone"} liked each other.`,
              read: false,
              createdAt: nowIso(),
              href: `/chat?match=${match.id}`,
            },
            ...notifications,
          ];
        }
      }

      return { ...store, reactions, matches, messages, notifications };
    });

    return createdMatch;
  },

  markMatchSeen(matchId: string): void {
    storageService.update((store) => ({
      ...store,
      matches: store.matches.map((m) =>
        m.id === matchId ? { ...m, seen: true } : m
      ),
    }));
  },

  getMessages(matchId: string): ChatMessage[] {
    return storageService
      .read()
      .messages.filter((m) => m.matchId === matchId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  sendMessage(userId: string, matchId: string, bodyRaw: string): ChatMessage {
    const body = bodyRaw.trim();
    if (body.length < 1) throw new Error("Message cannot be empty.");
    if (body.length > 2000) throw new Error("Message is too long.");

    const store = storageService.read();
    const match = store.matches.find((m) => m.id === matchId && m.userId === userId);
    if (!match) throw new Error("Match not found.");

    const message: ChatMessage = {
      id: createId("msg"),
      matchId,
      sender: "me",
      body,
      createdAt: nowIso(),
    };

    storageService.write({
      ...store,
      messages: [...store.messages, message],
    });

    // Simple local auto-reply for demo continuity (offline).
    window.setTimeout(() => {
      const peer = getPeerById(match.peerId);
      const reply: ChatMessage = {
        id: createId("msg"),
        matchId,
        sender: "peer",
        body: `Jazakallah khair for your message. Looking forward to learning more about your values and family goals. — ${peer?.displayName ?? "Match"}`,
        createdAt: nowIso(),
      };
      storageService.update((s) => ({
        ...s,
        messages: [...s.messages, reply],
      }));
      window.dispatchEvent(new CustomEvent("hel:data-changed"));
    }, 600);

    return message;
  },

  getNotifications(userId: string): AppNotification[] {
    return storageService
      .read()
      .notifications.filter((n) => n.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  markNotificationsRead(userId: string): void {
    storageService.update((store) => ({
      ...store,
      notifications: store.notifications.map((n) =>
        n.userId === userId ? { ...n, read: true } : n
      ),
    }));
  },

  addContact(input: {
    name: string;
    email: string;
    subject: string;
    message: string;
  }): void {
    storageService.update((store) => ({
      ...store,
      contacts: [
        {
          id: createId("contact"),
          ...input,
          createdAt: nowIso(),
        },
        ...store.contacts,
      ],
    }));
  },
};

export { notify };
