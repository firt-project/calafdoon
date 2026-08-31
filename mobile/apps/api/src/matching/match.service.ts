import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { LikeAction, MatchStatus, Profile } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { hasPaidAccess, isPremiumMember, isStaffRole, shouldHideProfileFromViewer } from "../common/access";
import { isDiscoverable, interactionLockMessage, isInteractionLocked } from "../common/review-status";
import { canViewerSeePhotos } from "../profile/photo-rules";
import {
  PRIVATE_REVEALS_PER_MATCH_BASIC,
  PRIVATE_REVEALS_PER_MATCH_PREMIUM,
} from "../profile/photo-rules";
import { MediaAccessService } from "../media/media-access.service";
import {
  resolveProfileMainImageUrl,
  resolveProfileMainMediaId,
} from "../media/profile-image-url";
import {
  MATCH_DISCOVER_LIMIT,
  MATCH_LIST_LIMIT,
  MIN_COMPATIBILITY_SCORE,
  makePairKey,
} from "./constants";
import { MatchFilterArgs, profilePassesMatchFilters } from "./filters";
import {
  computeHighlightKeys,
  dailyPickIndex,
  utcDayKey,
} from "./highlights";
import { ScoreService } from "./score.service";
import { PresenceService } from "../presence/presence.service";

type AccessCtx = { userId: string; profile: Profile };

@Injectable()
export class MatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scores: ScoreService,
    private readonly media: MediaAccessService,
    private readonly presence: PresenceService
  ) {}

  private async requireMatchAccess(userId: string): Promise<AccessCtx> {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) throw new ForbiddenException("Profile required");
    if (isInteractionLocked(profile)) {
      throw new ForbiddenException(interactionLockMessage(profile));
    }
    if (!profile.questionnaireComplete) {
      throw new ForbiddenException("Complete your questionnaire first");
    }
    if (!hasPaidAccess(profile)) {
      throw new ForbiddenException("Complete payment to like profiles");
    }
    if (!isDiscoverable(profile)) {
      throw new ForbiddenException("Your profile is pending review");
    }
    return { userId, profile };
  }

  private async getBlockedIds(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    const set = new Set<string>();
    for (const r of rows) {
      set.add(r.blockerId === userId ? r.blockedId : r.blockerId);
    }
    return set;
  }

  private async isEitherBlocked(a: string, b: string): Promise<boolean> {
    const row = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      },
      select: { id: true },
    });
    return !!row;
  }

  async discover(
    userId: string,
    filters: MatchFilterArgs,
    opts?: { cursor?: string; limit?: number }
  ) {
    const access = await this.requireMatchAccess(userId);
    const limit = Math.min(
      opts?.limit ?? MATCH_DISCOVER_LIMIT,
      MATCH_DISCOVER_LIMIT
    );

    const myLikes = await this.prisma.like.findMany({
      where: { fromUserId: userId },
      select: { toUserId: true, action: true },
    });
    const interacted = new Set(myLikes.map((l) => l.toUserId));
    const blocked = await this.getBlockedIds(userId);

    const scores = await this.prisma.compatibilityScore.findMany({
      where: {
        userAId: userId,
        score: { gte: MIN_COMPATIBILITY_SCORE },
      },
      orderBy: [{ score: "desc" }, { userBId: "asc" }],
      take: MATCH_DISCOVER_LIMIT * 4,
    });

    let candidates = scores
      .filter((s) => !interacted.has(s.userBId) && !blocked.has(s.userBId))
      .map((s) => ({ userId: s.userBId, score: s.score }));

    // Sparse community backfill: include other discoverable opposite-gender
    // members even when a stored score is missing or below the soft floor.
    // Build a large pool up front — scored rows often fail buildCard later.
    const poolTarget = MATCH_DISCOVER_LIMIT * 3;
    if (candidates.length < poolTarget) {
      const oppositeGender =
        access.profile.gender === "male" ? "female" : "male";
      const already = new Set(candidates.map((c) => c.userId));
      const extras = await this.prisma.profile.findMany({
        where: {
          gender: oppositeGender,
          role: "user",
          banned: false,
          questionnaireComplete: true,
          hasPaid: true,
          OR: [{ approved: true }, { reviewStatus: "approved" }],
          userId: {
            notIn: [userId, ...already, ...interacted, ...blocked],
          },
        },
        orderBy: { createdAt: "desc" },
        take: MATCH_DISCOVER_LIMIT * 4,
        select: { userId: true },
      });
      // Prefer profiles that have any score row; otherwise assign a mid score.
      const extraIds = extras.map((e) => e.userId);
      const extraScores =
        extraIds.length > 0
          ? await this.prisma.compatibilityScore.findMany({
              where: { userAId: userId, userBId: { in: extraIds } },
              select: { userBId: true, score: true },
            })
          : [];
      const scoreMap = new Map(extraScores.map((s) => [s.userBId, s.score]));
      for (const extra of extras) {
        if (already.has(extra.userId)) continue;
        candidates.push({
          userId: extra.userId,
          score: scoreMap.get(extra.userId) ?? 55,
        });
        already.add(extra.userId);
        if (candidates.length >= poolTarget) break;
      }
      candidates.sort((a, b) => b.score - a.score || a.userId.localeCompare(b.userId));
    }

    if (opts?.cursor) {
      const idx = candidates.findIndex((c) => c.userId === opts.cursor);
      if (idx >= 0) candidates = candidates.slice(idx + 1);
    }

    // Walk past non-discoverable / filtered cards until the page is full.
    const results = [];
    let walkIndex = 0;
    while (results.length < limit && walkIndex < candidates.length) {
      const c = candidates[walkIndex]!;
      walkIndex += 1;
      const card = await this.buildCard(
        access,
        c.userId,
        c.score,
        myLikes.find((l) => l.toUserId === c.userId)?.action ?? null,
        filters,
        true
      );
      if (card) results.push(card);
    }

    const nextCursor =
      results.length === limit && walkIndex < candidates.length
        ? results[results.length - 1]?.userId ?? null
        : null;

    return {
      items: results,
      nextCursor,
      minScore: MIN_COMPATIBILITY_SCORE,
      limit,
    };
  }

  /**
   * Personalized home feed: daily match, liked-you preview, mutual/new counts.
   * Additive only — does not change discover/lists behavior.
   */
  async homeFeed(userId: string) {
    const access = await this.requireMatchAccess(userId);
    const isPremium = isPremiumMember(access.profile);
    const dayKey = utcDayKey();

    const myLikes = await this.prisma.like.findMany({
      where: { fromUserId: userId },
      select: { toUserId: true, action: true },
    });
    const interacted = new Set(myLikes.map((l) => l.toUserId));
    const blocked = await this.getBlockedIds(userId);
    const activePartners = await this.activePartnerIds(userId);

    const scores = await this.prisma.compatibilityScore.findMany({
      where: {
        userAId: userId,
        score: { gte: MIN_COMPATIBILITY_SCORE },
      },
      orderBy: [{ score: "desc" }, { userBId: "asc" }],
      take: MATCH_DISCOVER_LIMIT * 3,
    });

    const discoverable = scores.filter(
      (s) => !interacted.has(s.userBId) && !blocked.has(s.userBId)
    );

    let dailyMatch: Awaited<ReturnType<typeof this.buildCard>> | null = null;
    if (discoverable.length > 0) {
      const start = dailyPickIndex(userId, dayKey, discoverable.length);
      for (let offset = 0; offset < discoverable.length; offset += 1) {
        const pick = discoverable[(start + offset) % discoverable.length]!;
        const card = await this.buildCard(
          access,
          pick.userBId,
          pick.score,
          null,
          {},
          false
        );
        if (card) {
          dailyMatch = card;
          break;
        }
      }
    }

    const incoming = await this.prisma.like.findMany({
      where: { toUserId: userId, action: "like" },
      take: MATCH_LIST_LIMIT,
      orderBy: { createdAt: "desc" },
    });
    const likedYouIds = incoming
      .filter((l) => !activePartners.has(l.fromUserId) && !blocked.has(l.fromUserId))
      .map((l) => l.fromUserId);
    const likedYouCount = likedYouIds.length;

    let likedYouPreview: Awaited<ReturnType<typeof this.buildCard>>[] = [];
    if (isPremium && likedYouIds.length > 0) {
      for (const id of likedYouIds.slice(0, 3)) {
        const card = await this.buildCard(
          access,
          id,
          scores.find((s) => s.userBId === id)?.score ?? 0,
          null,
          {},
          true
        );
        if (card) likedYouPreview.push(card);
      }
    }

    const activeMatches = await this.prisma.match.findMany({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
        status: "active",
      },
      include: { conversation: true },
      take: MATCH_LIST_LIMIT,
      orderBy: { updatedAt: "desc" },
    });

    let newMutualCount = 0;
    let pendingChatCount = 0;
    const recentMutuals: Array<{
      matchId: string;
      conversationId: string | null;
      score: number;
      isNew: boolean;
      name: string;
      imageUrl: string | null;
    }> = [];

    for (const m of activeMatches) {
      const otherId = m.userAId === userId ? m.userBId : m.userAId;
      if (blocked.has(otherId)) continue;
      const other = await this.prisma.profile.findUnique({
        where: { userId: otherId },
      });
      if (
        other &&
        shouldHideProfileFromViewer(access.profile.role, other.role)
      ) {
        continue;
      }
      const seenMap = (m.seenAtByUser as Record<string, number> | null) ?? {};
      const isNew = seenMap[userId] === undefined;
      if (isNew) newMutualCount += 1;

      const unread =
        ((m.conversation?.unreadByUser as Record<string, number> | null) ?? {})[
          userId
        ] ?? 0;
      if (unread > 0 || isNew) pendingChatCount += 1;

      if (recentMutuals.length < 3) {
        const photo = other
          ? await this.photoMeta(userId, other, access.profile.role, true)
          : { imageUrl: null as string | null };
        recentMutuals.push({
          matchId: m.id,
          conversationId: m.conversation?.id ?? null,
          score: m.score,
          isNew,
          name: other?.name ?? "Member",
          imageUrl: photo.imageUrl,
        });
      }
    }

    return {
      dayKey,
      isPremium,
      dailyMatch,
      likedYouCount,
      likedYouPreview,
      likedYouLocked: !isPremium,
      newMutualCount,
      pendingChatCount,
      discoverCount: discoverable.length,
      recentMutuals,
    };
  }

  async lists(userId: string, filters: MatchFilterArgs = {}) {
    const access = await this.requireMatchAccess(userId);
    const myLikes = await this.prisma.like.findMany({
      where: { fromUserId: userId },
    });
    const activePartners = await this.activePartnerIds(userId);
    const blocked = await this.getBlockedIds(userId);
    const scoreMap = await this.scoreMap(userId);

    const load = async (ids: string[]) => {
      const out = [];
      for (const id of ids.slice(0, MATCH_LIST_LIMIT)) {
        if (blocked.has(id)) continue;
        const card = await this.buildCard(
          access,
          id,
          scoreMap.get(id) ?? 0,
          myLikes.find((l) => l.toUserId === id)?.action ?? null,
          filters,
          true
        );
        if (card) out.push(card);
      }
      return out;
    };

    const shortlist = await load(
      myLikes.filter((l) => l.action === "shortlist").map((l) => l.toUserId)
    );
    const liked = await load(
      myLikes
        .filter((l) => l.action === "like" && !activePartners.has(l.toUserId))
        .map((l) => l.toUserId)
    );
    const passed = await load(
      myLikes.filter((l) => l.action === "pass").map((l) => l.toUserId)
    );

    let likedYou: Awaited<ReturnType<typeof load>> = [];
    if (hasPaidAccess(access.profile)) {
      const incoming = await this.prisma.like.findMany({
        where: { toUserId: userId, action: "like" },
        take: MATCH_LIST_LIMIT,
      });
      likedYou = await load(
        incoming
          .filter((l) => !activePartners.has(l.fromUserId))
          .map((l) => l.fromUserId)
      );
    }

    return { shortlist, liked, passed, likedYou };
  }

  async mutual(
    userId: string,
    list: "active" | "new" | "archived" = "active"
  ) {
    await this.requireMatchAccess(userId).catch(() => null);
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) throw new ForbiddenException("Profile required");

    const matches = await this.prisma.match.findMany({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
        ...(list === "archived"
          ? { status: "archived" as MatchStatus }
          : { status: "active" as MatchStatus }),
      },
      include: { conversation: true },
      orderBy: { updatedAt: "desc" },
      take: MATCH_LIST_LIMIT,
    });

    const blocked = await this.getBlockedIds(userId);
    const items = [];
    for (const m of matches) {
      const otherId = m.userAId === userId ? m.userBId : m.userAId;
      if (blocked.has(otherId)) continue;
      const seenMap = (m.seenAtByUser as Record<string, number> | null) ?? {};
      const isNew = m.status === "active" && seenMap[userId] === undefined;
      if (list === "new" && !isNew) continue;

      const other = await this.prisma.profile.findUnique({
        where: { userId: otherId },
      });
      if (
        other &&
        shouldHideProfileFromViewer(profile.role, other.role)
      ) {
        continue;
      }
      const photo = other
        ? await this.photoMeta(userId, other, profile.role, true)
        : { imageUrl: null, photoHidden: false, mediaId: null };

      let lastMessage: string | null = null;
      if (m.conversation) {
        const last = await this.prisma.message.findFirst({
          where: { conversationId: m.conversation.id },
          orderBy: [{ messageCreatedAt: "desc" }, { id: "desc" }],
          select: { body: true },
        });
        lastMessage = last?.body ?? null;
      }

      items.push({
        matchId: m.id,
        conversationId: m.conversation?.id ?? null,
        score: m.score,
        chatUnlocked: m.chatUnlocked,
        status: m.status,
        isNew,
        pairKey: m.pairKey,
        hasMessages: !!lastMessage,
        lastMessage,
        lastMessageAt: lastMessage
          ? m.conversation?.lastMessageAt?.toISOString() ?? null
          : null,
        matchedAt: m.createdAt.toISOString(),
        profile: other
          ? {
              userId: otherId,
              name: other.name,
              age: other.age,
              country: other.country,
              city: other.city,
              imageUrl: photo.imageUrl,
              photoHidden: photo.photoHidden,
              photoMediaId: photo.mediaId,
              reviewStatus: other.reviewStatus,
              approved: other.approved,
            }
          : null,
      });
    }
    return { items };
  }

  /**
   * Open (or reuse) a conversation without requiring a like.
   * Paid + profile access still required; blocked pairs are rejected.
   */
  async startChat(
    userId: string,
    targetUserId: string
  ): Promise<{
    matched: true;
    matchId: string;
    conversationId: string;
    mutual: boolean;
    reactivated?: boolean;
  }> {
    const access = await this.requireMatchAccess(userId);
    const { target, meUser, targetUser } = await this.requirePeerForChat(
      access,
      targetUserId
    );

    const [mine, reverse] = await Promise.all([
      this.prisma.like.findUnique({
        where: {
          fromUserId_toUserId: {
            fromUserId: userId,
            toUserId: targetUserId,
          },
        },
      }),
      this.prisma.like.findUnique({
        where: {
          fromUserId_toUserId: {
            fromUserId: targetUserId,
            toUserId: userId,
          },
        },
      }),
    ]);
    const mutual = mine?.action === "like" && reverse?.action === "like";

    const result = await this.createOrReactivateMatch(
      userId,
      targetUserId,
      meUser.convexId,
      targetUser.convexId
    );

    if (!result.conversationId || !result.matchId) {
      throw new BadRequestException("Could not open chat");
    }

    if (mutual) {
      await this.notifyMutualMatch(
        access,
        target,
        meUser.convexId,
        targetUser.convexId,
        targetUserId,
        result.matchId
      );
    }

    return {
      matched: true,
      matchId: result.matchId,
      conversationId: result.conversationId,
      mutual,
      reactivated: result.reactivated,
    };
  }

  async act(
    userId: string,
    targetUserId: string,
    action: LikeAction
  ): Promise<{
    matched: boolean;
    mutual: boolean;
    matchId?: string;
    conversationId?: string;
    reactivated?: boolean;
  }> {
    const access = await this.requireMatchAccess(userId);
    const { target, meUser, targetUser } = await this.requirePeerForChat(
      access,
      targetUserId
    );

    await this.prisma.like.upsert({
      where: {
        fromUserId_toUserId: { fromUserId: userId, toUserId: targetUserId },
      },
      create: {
        convexId: `local_like_${randomUUID()}`,
        fromUserId: userId,
        toUserId: targetUserId,
        convexFromUserId: meUser.convexId,
        convexToUserId: targetUser.convexId,
        action,
      },
      update: { action },
    });

    if (action === "pass" || action === "shortlist") {
      return { matched: false, mutual: false };
    }

    await this.createNotificationSafe({
      userId: targetUserId,
      convexUserId: targetUser.convexId,
      type: "like",
      title: "Someone liked you!",
      body: `${access.profile.name ?? "Someone"} liked your profile.`,
      relatedUserId: userId,
      convexRelatedUserId: meUser.convexId,
      sourceKey: `like:${userId}:${targetUserId}`,
    });

    const reverse = await this.prisma.like.findUnique({
      where: {
        fromUserId_toUserId: {
          fromUserId: targetUserId,
          toUserId: userId,
        },
      },
    });
    const mutual = reverse?.action === "like";

    // One like is enough to open chat; mutual is only when both liked.
    const result = await this.createOrReactivateMatch(
      userId,
      targetUserId,
      meUser.convexId,
      targetUser.convexId
    );

    if (mutual && result.matched && result.matchId) {
      await this.notifyMutualMatch(
        access,
        target,
        meUser.convexId,
        targetUser.convexId,
        targetUserId,
        result.matchId
      );
    }

    return { ...result, mutual };
  }

  private async requirePeerForChat(access: AccessCtx, targetUserId: string) {
    if (targetUserId === access.userId) {
      throw new BadRequestException("You cannot interact with your own profile");
    }
    if (await this.isEitherBlocked(access.userId, targetUserId)) {
      throw new ForbiddenException("You cannot interact with this user");
    }
    const target = await this.prisma.profile.findUnique({
      where: { userId: targetUserId },
    });
    if (!target || !isDiscoverable(target)) {
      throw new NotFoundException("This profile is not available");
    }
    // Staff never enter the member dating graph (either direction).
    if (
      isStaffRole(access.profile.role) ||
      isStaffRole(target.role) ||
      shouldHideProfileFromViewer(access.profile.role, target.role)
    ) {
      throw new NotFoundException("This profile is not available");
    }

    const targetUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: targetUserId },
    });
    const meUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: access.userId },
    });
    return { target, meUser, targetUser };
  }

  private async notifyMutualMatch(
    access: AccessCtx,
    target: Profile,
    meConvexId: string,
    targetConvexId: string,
    targetUserId: string,
    matchId: string
  ) {
    const myName = access.profile.name ?? "Someone";
    const targetName = target.name ?? "Someone";
    await this.createNotificationSafe({
      userId: access.userId,
      convexUserId: meConvexId,
      type: "match",
      title: "New Match!",
      body: `You matched with ${targetName}!`,
      relatedUserId: targetUserId,
      convexRelatedUserId: targetConvexId,
      sourceKey: `match:${matchId}:${access.userId}`,
    });
    await this.createNotificationSafe({
      userId: targetUserId,
      convexUserId: targetConvexId,
      type: "match",
      title: "New Match!",
      body: `You matched with ${myName}!`,
      relatedUserId: access.userId,
      convexRelatedUserId: meConvexId,
      sourceKey: `match:${matchId}:${targetUserId}`,
    });
  }

  /** Idempotent notification insert — duplicate sourceKey is a silent no-op. */
  private async createNotificationSafe(data: {
    userId: string;
    convexUserId: string;
    type: "like" | "match";
    title: string;
    body: string;
    relatedUserId: string;
    convexRelatedUserId: string;
    sourceKey: string;
  }) {
    try {
      await this.prisma.notification.create({
        data: {
          convexId: `local_notif_${randomUUID()}`,
          userId: data.userId,
          convexUserId: data.convexUserId,
          type: data.type,
          title: data.title,
          body: data.body,
          read: false,
          relatedUserId: data.relatedUserId,
          convexRelatedUserId: data.convexRelatedUserId,
          sourceKey: data.sourceKey,
          notificationCreatedAt: new Date(),
        },
      });
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? (err as { code?: string }).code
          : undefined;
      if (code !== "P2002") throw err;
    }
  }

  private async createOrReactivateMatch(
    likerId: string,
    targetId: string,
    likerConvexId: string,
    targetConvexId: string
  ) {
    const pairKey = makePairKey(likerId, targetId);
    const scoreRow = await this.prisma.compatibilityScore.findUnique({
      where: {
        userAId_userBId: { userAId: likerId, userBId: targetId },
      },
    });
    const matchScore = scoreRow?.score ?? 0;

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.match.findUnique({ where: { pairKey } });
      if (existing) {
        const wasInactive = existing.status !== "active";
        if (wasInactive) {
          await tx.match.update({
            where: { id: existing.id },
            data: {
              status: "active",
              score: matchScore,
              chatUnlocked: false,
              archivedAt: null,
            },
          });
        }
        let conversation = await tx.conversation.findUnique({
          where: { matchId: existing.id },
        });
        if (!conversation) {
          conversation = await tx.conversation.create({
            data: {
              convexId: `local_conv_${randomUUID()}`,
              matchId: existing.id,
              convexMatchId: existing.convexId,
              participantConvexIds: [likerConvexId, targetConvexId],
              participantUserIds: [likerId, targetId],
              lastMessageAt: new Date(),
              unreadByUser: { [likerId]: 0, [targetId]: 0 },
            },
          });
        } else if (
          !conversation.participantUserIds?.length ||
          conversation.participantUserIds.length < 2
        ) {
          conversation = await tx.conversation.update({
            where: { id: conversation.id },
            data: {
              participantUserIds: [existing.userAId, existing.userBId],
            },
          });
        }
        return {
          matched: true as const,
          matchId: existing.id,
          conversationId: conversation.id,
          reactivated: wasInactive,
        };
      }

      try {
        const match = await tx.match.create({
          data: {
            convexId: `local_match_${randomUUID()}`,
            pairKey,
            // Preserve Convex semantics: liker = userA
            userAId: likerId,
            userBId: targetId,
            convexUserA: likerConvexId,
            convexUserB: targetConvexId,
            score: matchScore,
            status: "active",
            chatUnlocked: false,
          },
        });
        const conversation = await tx.conversation.create({
          data: {
            convexId: `local_conv_${randomUUID()}`,
            matchId: match.id,
            convexMatchId: match.convexId,
            participantConvexIds: [likerConvexId, targetConvexId],
            participantUserIds: [likerId, targetId],
            lastMessageAt: new Date(),
            unreadByUser: { [likerId]: 0, [targetId]: 0 },
          },
        });
        return {
          matched: true as const,
          matchId: match.id,
          conversationId: conversation.id,
        };
      } catch (err: unknown) {
        const code =
          err && typeof err === "object" && "code" in err
            ? (err as { code?: string }).code
            : undefined;
        if (code === "P2002") {
          const again = await tx.match.findUnique({ where: { pairKey } });
          if (again) {
            const conversation = await tx.conversation.findUnique({
              where: { matchId: again.id },
            });
            return {
              matched: true as const,
              matchId: again.id,
              conversationId: conversation?.id,
            };
          }
        }
        throw err;
      }
    });
  }

  async markSeen(userId: string, matchId: string) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException("Match not found");
    if (match.userAId !== userId && match.userBId !== userId) {
      throw new ForbiddenException("Not authorized");
    }
    const seen = {
      ...((match.seenAtByUser as Record<string, number> | null) ?? {}),
      [userId]: Date.now(),
    };
    await this.prisma.match.update({
      where: { id: matchId },
      data: { seenAtByUser: seen },
    });
    return { ok: true };
  }

  async archive(userId: string, matchId: string, archived: boolean) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException("Match not found");
    if (match.userAId !== userId && match.userBId !== userId) {
      throw new ForbiddenException("Not authorized");
    }
    if (match.status === "unmatched") {
      throw new BadRequestException("This match is no longer available");
    }
    await this.prisma.match.update({
      where: { id: matchId },
      data: archived
        ? { status: "archived", archivedAt: new Date() }
        : { status: "active", archivedAt: null },
    });
    return { ok: true };
  }

  async breakdown(viewerId: string, targetUserId: string) {
    const access = await this.requireMatchAccess(viewerId);
    if (await this.isEitherBlocked(viewerId, targetUserId)) {
      throw new ForbiddenException("You cannot interact with this user");
    }
    const target = await this.prisma.profile.findUnique({
      where: { userId: targetUserId },
    });
    if (!target) throw new NotFoundException("Profile not found");
    const prefs = await this.prisma.preference.findUnique({
      where: { userId: viewerId },
    });
    const targetPrefs = await this.prisma.preference.findUnique({
      where: { userId: targetUserId },
    });
    if (!prefs || !targetPrefs) {
      throw new BadRequestException("Preferences required");
    }
    const breakdown = this.scores.calculateBreakdown(
      access.profile,
      prefs,
      target,
      targetPrefs
    );
    const stored = await this.prisma.compatibilityScore.findUnique({
      where: {
        userAId_userBId: { userAId: viewerId, userBId: targetUserId },
      },
    });
    return {
      total: breakdown.total,
      categories: breakdown.categories,
      storedScore: stored?.score ?? null,
      scoreVersion: stored?.scoreVersion ?? null,
      lastCalculatedAt: stored?.lastCalculatedAt?.toISOString() ?? null,
    };
  }

  /**
   * Full dating card for a peer (match or discoverable) — never includes email/phone.
   * Used when opening a member from chat / matches.
   */
  async getPeerCard(viewerId: string, targetUserId: string) {
    const access = await this.requireMatchAccess(viewerId);
    if (targetUserId === viewerId) {
      throw new BadRequestException("You cannot view your own profile this way");
    }
    if (await this.isEitherBlocked(viewerId, targetUserId)) {
      throw new ForbiddenException("You cannot interact with this user");
    }

    const partners = await this.activePartnerIds(viewerId);
    const isMatch = partners.has(targetUserId);
    const profile = await this.prisma.profile.findUnique({
      where: { userId: targetUserId },
    });
    if (!profile || profile.banned) {
      throw new NotFoundException("Profile not found");
    }
    if (shouldHideProfileFromViewer(access.profile.role, profile.role)) {
      throw new NotFoundException("Profile not found");
    }
    if (!isMatch && !isDiscoverable(profile)) {
      throw new ForbiddenException("Profile is not available");
    }

    const scores = await this.scoreMap(viewerId);
    let score = scores.get(targetUserId) ?? 0;
    let matchId: string | null = null;
    if (isMatch) {
      const match = await this.prisma.match.findFirst({
        where: {
          status: "active",
          OR: [
            { userAId: viewerId, userBId: targetUserId },
            { userAId: targetUserId, userBId: viewerId },
          ],
        },
        select: { id: true, score: true },
      });
      matchId = match?.id ?? null;
      if (match?.score != null) score = match.score;
    }

    const like = await this.prisma.like.findUnique({
      where: {
        fromUserId_toUserId: { fromUserId: viewerId, toUserId: targetUserId },
      },
      select: { action: true },
    });
    const action = (like?.action as LikeAction | undefined) ?? null;
    const photo = await this.photoMeta(
      viewerId,
      profile,
      access.profile.role,
      isMatch
    );

    return {
      userId: targetUserId,
      matchId,
      mutualMatch: isMatch,
      name: profile.name ?? "Member",
      age: profile.age,
      country: profile.country ?? "",
      city: profile.city ?? undefined,
      height: profile.height ?? undefined,
      education: profile.education ?? "",
      occupation: profile.occupation ?? "",
      religiousLevel: profile.religiousLevel ?? "",
      prayerFrequency: profile.prayerFrequency ?? undefined,
      bio: profile.bio || undefined,
      maritalStatus: profile.maritalStatus ?? undefined,
      marriageTimeline: profile.marriageTimeline ?? undefined,
      wantChildren: profile.wantChildren ?? undefined,
      languagesSpoken: profile.languagesSpoken ?? [],
      hobbies: profile.hobbies ?? [],
      score,
      action,
      liked: action === "like",
      shortlisted: action === "shortlist",
      imageUrl: photo.imageUrl,
      photoHidden: photo.photoHidden,
      photoMediaId: photo.mediaId,
      additionalImageUrls: photo.additionalUrls ?? [],
      highlightKeys: computeHighlightKeys(access.profile, profile),
      reviewStatus: profile.reviewStatus,
      approved: profile.approved,
      hasPaid: profile.hasPaid,
      hasPersonalSupport: !!profile.hasPersonalSupport,
      questionnaireComplete: profile.questionnaireComplete,
      verified: profile.verified,
      contactPrivacyNote:
        "Contact details stay private. Email and phone are never shared here.",
    };
  }

  async getWali(viewerId: string, matchId: string) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException("Match not found");
    if (match.userAId !== viewerId && match.userBId !== viewerId) {
      throw new ForbiddenException("Not authorized");
    }
    if (match.status !== "active") {
      return { waliName: null, waliPhone: null };
    }
    const otherId =
      match.userAId === viewerId ? match.userBId : match.userAId;
    if (await this.isEitherBlocked(viewerId, otherId)) {
      throw new ForbiddenException("Access denied");
    }
    const other = await this.prisma.profile.findUnique({
      where: { userId: otherId },
    });
    if (!other?.waliName && !other?.waliPhone) {
      return { waliName: null, waliPhone: null };
    }
    return {
      waliName: other?.waliName ?? null,
      waliPhone: other?.waliPhone ?? null,
    };
  }

  /**
   * Status of one-time private photo reveals for this mutual match.
   * Never exposes unreaveled private media IDs — only a count teaser.
   */
  async getPrivateRevealStatus(userId: string, matchId: string) {
    const { match, ownerId, viewerProfile } = await this.requireActiveMatchPeer(
      userId,
      matchId
    );
    const owner = await this.prisma.profile.findUnique({
      where: { userId: ownerId },
    });
    const privateIds = owner?.privateImageMediaIds ?? [];
    const reveals = await this.prisma.photoReveal.findMany({
      where: { matchId: match.id, viewerUserId: userId },
      orderBy: { revealedAt: "asc" },
    });
    const maxReveals = isPremiumMember(viewerProfile)
      ? PRIVATE_REVEALS_PER_MATCH_PREMIUM
      : PRIVATE_REVEALS_PER_MATCH_BASIC;
    const remaining = Math.max(0, maxReveals - reveals.length);

    const revealed = [];
    for (const row of reveals) {
      try {
        const signed = await this.media.createSignedDownloadUrl(row.mediaId, {
          userId,
          roles: [viewerProfile.role],
          privatePhotoPeerIds: [ownerId],
        });
        revealed.push({
          mediaId: row.mediaId,
          url: signed.url,
          revealedAt: row.revealedAt.toISOString(),
        });
      } catch {
        revealed.push({
          mediaId: row.mediaId,
          url: null as string | null,
          revealedAt: row.revealedAt.toISOString(),
        });
      }
    }

    const unreaveledCount = privateIds.filter(
      (id) => !reveals.some((r) => r.mediaId === id)
    ).length;

    return {
      matchId: match.id,
      hasPrivatePhotos: privateIds.length > 0,
      privatePhotoCount: privateIds.length,
      unreaveledCount,
      maxReveals,
      usedReveals: reveals.length,
      remainingReveals: remaining,
      canReveal: remaining > 0 && unreaveledCount > 0,
      revealed,
      isPremium: isPremiumMember(viewerProfile),
    };
  }

  /**
   * Spend one reveal credit to unlock the next (or specified) private photo.
   */
  async revealPrivatePhoto(
    userId: string,
    matchId: string,
    mediaId?: string
  ) {
    const { match, ownerId, viewerProfile, ownerConvexId, viewerConvexId } =
      await this.requireActiveMatchPeer(userId, matchId);
    const owner = await this.prisma.profile.findUnique({
      where: { userId: ownerId },
    });
    if (!owner) throw new NotFoundException("Profile not found");

    const privateIds = owner.privateImageMediaIds ?? [];
    if (privateIds.length === 0) {
      throw new BadRequestException("This member has no private photos");
    }

    const reveals = await this.prisma.photoReveal.findMany({
      where: { matchId: match.id, viewerUserId: userId },
    });
    const maxReveals = isPremiumMember(viewerProfile)
      ? PRIVATE_REVEALS_PER_MATCH_PREMIUM
      : PRIVATE_REVEALS_PER_MATCH_BASIC;
    if (reveals.length >= maxReveals) {
      throw new ForbiddenException(
        "You have used all private photo reveals for this match"
      );
    }

    const already = new Set(reveals.map((r) => r.mediaId));
    const targetMediaId =
      mediaId && privateIds.includes(mediaId) && !already.has(mediaId)
        ? mediaId
        : privateIds.find((id) => !already.has(id));

    if (!targetMediaId) {
      throw new BadRequestException("No more private photos to reveal");
    }

    const media = await this.prisma.mediaObject.findUnique({
      where: { id: targetMediaId },
    });
    if (
      !media ||
      media.ownerUserId !== ownerId ||
      media.purpose !== "profile_private"
    ) {
      throw new NotFoundException("Private photo not found");
    }

    try {
      await this.prisma.photoReveal.create({
        data: {
          matchId: match.id,
          viewerUserId: userId,
          ownerUserId: ownerId,
          mediaId: targetMediaId,
        },
      });
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? (err as { code?: string }).code
          : undefined;
      if (code !== "P2002") throw err;
    }

    const signed = await this.media.createSignedDownloadUrl(targetMediaId, {
      userId,
      roles: [viewerProfile.role],
      privatePhotoPeerIds: [ownerId],
    });

    await this.createNotificationSafe({
      userId: ownerId,
      convexUserId: ownerConvexId,
      type: "match",
      title: "Private photo revealed",
      body: `${viewerProfile.name ?? "Your match"} viewed one of your private photos.`,
      relatedUserId: userId,
      convexRelatedUserId: viewerConvexId,
      sourceKey: `photo_reveal:${match.id}:${userId}:${targetMediaId}`,
    });

    return {
      mediaId: targetMediaId,
      url: signed.url,
      remainingReveals: Math.max(0, maxReveals - reveals.length - 1),
    };
  }

  private async requireActiveMatchPeer(userId: string, matchId: string) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new NotFoundException("Match not found");
    if (match.userAId !== userId && match.userBId !== userId) {
      throw new ForbiddenException("Not authorized");
    }
    if (match.status !== "active") {
      throw new BadRequestException("This match is no longer available");
    }
    const ownerId = match.userAId === userId ? match.userBId : match.userAId;
    if (await this.isEitherBlocked(userId, ownerId)) {
      throw new ForbiddenException("Access denied");
    }
    const viewerProfile = await this.prisma.profile.findUnique({
      where: { userId },
    });
    if (!viewerProfile) throw new ForbiddenException("Profile required");
    const ownerUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: ownerId },
    });
    const viewerUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    return {
      match,
      ownerId,
      viewerProfile,
      ownerConvexId: ownerUser.convexId,
      viewerConvexId: viewerUser.convexId,
    };
  }

  private async activePartnerIds(userId: string): Promise<Set<string>> {
    const matches = await this.prisma.match.findMany({
      where: {
        status: "active",
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      select: { userAId: true, userBId: true },
    });
    const set = new Set<string>();
    for (const m of matches) {
      set.add(m.userAId === userId ? m.userBId : m.userAId);
    }
    return set;
  }

  private async scoreMap(userId: string): Promise<Map<string, number>> {
    const rows = await this.prisma.compatibilityScore.findMany({
      where: { userAId: userId },
      select: { userBId: true, score: true },
    });
    return new Map(rows.map((r) => [r.userBId, r.score]));
  }

  private async buildCard(
    access: AccessCtx,
    targetUserId: string,
    score: number,
    action: LikeAction | null,
    filters: MatchFilterArgs,
    listPreview: boolean
  ) {
    const profile = await this.prisma.profile.findUnique({
      where: { userId: targetUserId },
    });
    if (!profile || profile.banned || !isDiscoverable(profile)) return null;
    if (shouldHideProfileFromViewer(access.profile.role, profile.role)) {
      return null;
    }
    // Prefer photos, but still show members without one when the pool is small.
    if (!profilePassesMatchFilters(profile, filters)) return null;

    const activePartners = await this.activePartnerIds(access.userId);
    const mutual = activePartners.has(targetUserId);
    const photo = await this.photoMeta(
      access.userId,
      profile,
      access.profile.role,
      mutual
    );

    return {
      userId: targetUserId,
      name: profile.name ?? "Member",
      age: profile.age,
      gender: profile.gender ?? undefined,
      country: profile.country ?? "",
      city: profile.city ?? undefined,
      height: profile.height ?? undefined,
      education: profile.education ?? "",
      occupation: profile.occupation ?? "",
      religiousLevel: profile.religiousLevel ?? "",
      prayerFrequency: profile.prayerFrequency ?? undefined,
      bio: profile.bio || undefined,
      maritalStatus: profile.maritalStatus ?? undefined,
      marriageTimeline: profile.marriageTimeline ?? undefined,
      wantChildren: profile.wantChildren ?? undefined,
      languagesSpoken: profile.languagesSpoken ?? [],
      qualities: profile.qualities ?? [],
      hobbies: profile.hobbies ?? [],
      score,
      action,
      liked: action === "like",
      shortlisted: action === "shortlist",
      mutualMatch: mutual,
      imageUrl: photo.imageUrl,
      photoHidden: photo.photoHidden,
      photoMediaId: photo.mediaId,
      additionalImageUrls: listPreview ? [] : photo.additionalUrls,
      highlightKeys: computeHighlightKeys(access.profile, profile),
      reviewStatus: profile.reviewStatus,
      approved: profile.approved,
      hasPaid: profile.hasPaid,
      hasPersonalSupport: !!profile.hasPersonalSupport,
      questionnaireComplete: profile.questionnaireComplete,
      verified: profile.verified,
      isOnline: await this.presence.isOnline(targetUserId),
    };
  }

  private async photoMeta(
    viewerId: string,
    profile: Profile,
    viewerRole: Profile["role"],
    hasActiveMatch = false
  ) {
    const allowed = canViewerSeePhotos({
      viewerUserId: viewerId,
      profileOwnerUserId: profile.userId,
      photoVisibility: profile.photoVisibility,
      isStaff: isStaffRole(viewerRole),
      hasActiveMatch,
    });
    const mediaId = await resolveProfileMainMediaId(this.prisma, profile);
    if (!allowed) {
      return {
        imageUrl: null as string | null,
        photoHidden: !!(mediaId || profile.profileImageConvexId),
        mediaId: null as string | null,
        additionalUrls: [] as string[],
      };
    }
    const imageUrl = mediaId
      ? await resolveProfileMainImageUrl(this.prisma, this.media, profile, {
          userId: viewerId,
          roles: [viewerRole],
        })
      : null;
    return {
      imageUrl,
      photoHidden: false,
      mediaId,
      additionalUrls: [] as string[],
    };
  }
}
