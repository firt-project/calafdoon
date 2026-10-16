import type { PrismaService } from "../prisma/prisma.service";

const TTL_MS = 60_000;

let cached: { at: number; ids: Set<string> } | null = null;
let inflight: Promise<Set<string>> | null = null;

/**
 * Which members currently have a playable profile video. Profile cards ask this for every
 * candidate, so one indexed query per minute replaces one query per card. Playback is
 * authorized separately, so a stale flag can never expose a removed video.
 */
export async function hasActiveProfileVideo(
  prisma: Pick<PrismaService, "profileVideo">,
  userId: string
): Promise<boolean> {
  const now = Date.now();
  if (!cached || now - cached.at > TTL_MS) {
    inflight ??= prisma.profileVideo
      .findMany({
        where: { isActive: true, status: "ready" },
        select: { userId: true },
      })
      .then((rows) => {
        cached = { at: Date.now(), ids: new Set(rows.map((r) => r.userId)) };
        return cached.ids;
      })
      .finally(() => {
        inflight = null;
      });
    await inflight;
  }
  return cached?.ids.has(userId) ?? false;
}

export function resetActiveVideoCache() {
  cached = null;
  inflight = null;
}
