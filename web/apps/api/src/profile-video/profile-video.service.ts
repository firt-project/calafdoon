import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { hasPaidAccess, isStaffRole } from "../common/access";
import {
  interactionLockMessage,
  isDiscoverable,
  isInteractionLocked,
} from "../common/review-status";
import { canViewerSeePhotos } from "../profile/photo-rules";
import { BUNNY_STATUS, BunnyStreamClient, type BunnyVideo } from "./bunny-stream.client";
import {
  ALLOWED_VIDEO_TYPES,
  MAX_STORED_BYTES,
  MAX_UPLOAD_BYTES,
  MAX_VIDEO_SECONDS,
  PROCESSING_TIMEOUT_MS,
  SERVER_DURATION_TOLERANCE_SECONDS,
  STATUS_REFRESH_MIN_MS,
} from "./profile-video.constants";

const PENDING = ["created", "uploading", "processing"] as const;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const CLEANUP_BATCH = 20;

export type VideoView = {
  id: string;
  status: "uploading" | "processing" | "ready" | "failed" | "rejected";
  progress: number;
  durationSec: number | null;
  failureReason: string | null;
  isActive: boolean;
  createdAt: string;
};

type Row = {
  id: string;
  userId: string;
  bunnyVideoId: string;
  status: string;
  isActive: boolean;
  durationSec: number | null;
  encodeProgress: number;
  failureReason: string | null;
  expiresAt: Date | null;
  lastCheckedAt: Date | null;
  createdAt: Date;
};

function isUniqueViolation(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    (err as { code?: string }).code === "P2002"
  );
}

function toView(r: Row): VideoView {
  const status =
    r.status === "created" || r.status === "uploading"
      ? "uploading"
      : (r.status as VideoView["status"]);
  return {
    id: r.id,
    status,
    progress: r.status === "ready" ? 100 : r.encodeProgress,
    durationSec: r.durationSec,
    failureReason: r.failureReason,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
  };
}

@Injectable()
export class ProfileVideoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProfileVideoService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bunny: BunnyStreamClient
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => void this.maintenance(), CLEANUP_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private limits() {
    return {
      maxDurationSec: MAX_VIDEO_SECONDS,
      maxBytes: MAX_UPLOAD_BYTES,
      allowedTypes: [...ALLOWED_VIDEO_TYPES],
    };
  }

  // ───────────────────────── member: upload ─────────────────────────

  async requestUpload(
    userId: string,
    input: { contentType: string; sizeBytes: number; durationSec?: number }
  ) {
    this.bunny.getLibraryId(); // 503 when not configured

    const contentType = input.contentType.toLowerCase().trim();
    if (!(ALLOWED_VIDEO_TYPES as readonly string[]).includes(contentType)) {
      throw new BadRequestException("Only MP4 or MOV videos are allowed.");
    }
    if (
      !Number.isInteger(input.sizeBytes) ||
      input.sizeBytes <= 0 ||
      input.sizeBytes > MAX_UPLOAD_BYTES
    ) {
      throw new BadRequestException(
        `Video is too large (max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB).`
      );
    }
    if (input.durationSec !== undefined && input.durationSec > MAX_VIDEO_SECONDS) {
      throw new BadRequestException(`Video must be ${MAX_VIDEO_SECONDS} seconds or shorter.`);
    }

    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) throw new ForbiddenException("Profile required");
    if (profile.banned) throw new ForbiddenException("Your account cannot upload videos.");

    const pending = await this.prisma.profileVideo.findFirst({
      where: { userId, status: { in: [...PENDING] } },
    });
    if (pending) {
      if (pending.status === "processing") {
        throw new ConflictException("Your previous video is still being processed.");
      }
      if (pending.expiresAt && pending.expiresAt.getTime() > Date.now()) {
        // Interrupted upload: hand back fresh credentials for the same video (resume).
        return { resumed: true as const, ...this.credentials(pending.bunnyVideoId) };
      }
      await this.markFailed(pending, "Upload expired. Please try again.");
    }

    // Older failed attempts are no longer needed once a new one starts.
    await this.prisma.profileVideo.deleteMany({
      where: { userId, status: { in: ["failed", "rejected"] } },
    });

    const guid = await this.bunny.createVideo(`profile-video-${randomUUID()}`);
    try {
      await this.prisma.profileVideo.create({
        data: {
          userId,
          bunnyVideoId: guid,
          status: "created",
          expiresAt: new Date(Date.now() + this.credentialsTtlMs()),
        },
      });
    } catch (err) {
      await this.queueCleanup(guid);
      if (isUniqueViolation(err)) {
        // Lost a race with a concurrent request: reuse the winner.
        const winner = await this.prisma.profileVideo.findFirst({
          where: { userId, status: { in: [...PENDING] } },
        });
        if (winner) {
          return { resumed: true as const, ...this.credentials(winner.bunnyVideoId) };
        }
      }
      throw err;
    }
    return { resumed: false as const, ...this.credentials(guid) };
  }

  private credentialsTtlMs() {
    return 2 * 60 * 60 * 1000;
  }

  private credentials(videoId: string) {
    return { ...this.bunny.signUpload(videoId), ...this.limits() };
  }

  /** The app finished sending bytes; start tracking processing. */
  async confirmUpload(userId: string) {
    const row = await this.prisma.profileVideo.findFirst({
      where: { userId, status: { in: [...PENDING] } },
    });
    if (!row) throw new NotFoundException("No upload in progress.");
    const updated = await this.refresh(row as Row, true);
    return { video: toView(updated) };
  }

  // ───────────────────────── member: status ─────────────────────────

  async getMyStatus(userId: string) {
    const rows = (await this.prisma.profileVideo.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
    })) as Row[];

    let pending = rows.find((r) => (PENDING as readonly string[]).includes(r.status));
    if (pending && this.bunny.configured) {
      try {
        pending = await this.refresh(pending);
      } catch (err) {
        // Bunny hiccup: show last known state rather than failing the screen.
        this.logger.warn(
          `status refresh failed: ${err instanceof Error ? err.name : "unknown"}`
        );
      }
    }
    const fresh = (await this.prisma.profileVideo.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
    })) as Row[];
    const active = fresh.find((r) => r.isActive && r.status === "ready");
    const stillPending = fresh.find((r) => (PENDING as readonly string[]).includes(r.status));
    const failure = fresh.find(
      (r) =>
        (r.status === "failed" || r.status === "rejected") &&
        Date.now() - r.createdAt.getTime() < 24 * 60 * 60 * 1000
    );
    return {
      configured: this.bunny.configured,
      active: active ? toView(active) : null,
      pending: stillPending ? toView(stillPending) : null,
      lastFailure: failure ? { reason: failure.failureReason ?? "Upload failed." } : null,
      ...this.limits(),
    };
  }

  // ───────────────────────── processing state ─────────────────────────

  /** Pull current state from Bunny and apply it (safe to repeat). */
  async refresh(row: Row, force = false): Promise<Row> {
    if (!(PENDING as readonly string[]).includes(row.status)) return row;
    if (
      !force &&
      row.lastCheckedAt &&
      Date.now() - row.lastCheckedAt.getTime() < STATUS_REFRESH_MIN_MS
    ) {
      return row;
    }
    const video = await this.bunny.getVideo(row.bunnyVideoId);
    return this.applyBunnyState(row, video);
  }

  async applyBunnyState(row: Row, video: BunnyVideo | null): Promise<Row> {
    if (!(PENDING as readonly string[]).includes(row.status)) return row; // idempotent

    if (!video) {
      if (row.status === "created" || row.status === "uploading") {
        return this.touch(row, {});
      }
      return (await this.markFailed(row, "Video was not found. Please upload again.")) ?? row;
    }

    const age = Date.now() - row.createdAt.getTime();
    switch (video.status) {
      case BUNNY_STATUS.error:
      case BUNNY_STATUS.uploadFailed:
        return (
          (await this.markFailed(row, "Video processing failed. Try a different video.")) ?? row
        );
      case BUNNY_STATUS.finished:
        return this.finish(row, video);
      case BUNNY_STATUS.uploaded:
      case BUNNY_STATUS.processing:
      case BUNNY_STATUS.transcoding:
        if (age > PROCESSING_TIMEOUT_MS) {
          return (await this.markFailed(row, "Processing took too long. Please try again.")) ?? row;
        }
        return this.touch(row, {
          status: "processing",
          encodeProgress: Math.max(0, Math.min(99, Math.round(video.encodeProgress))),
        });
      default:
        // Created: bytes not received yet.
        if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
          return (await this.markFailed(row, "Upload expired. Please try again.")) ?? row;
        }
        return this.touch(row, { status: "uploading" });
    }
  }

  private async touch(
    row: Row,
    data: { status?: "uploading" | "processing"; encodeProgress?: number }
  ): Promise<Row> {
    await this.prisma.profileVideo.updateMany({
      where: { id: row.id, status: { in: [...PENDING] } },
      data: { ...data, lastCheckedAt: new Date() },
    });
    const next = await this.prisma.profileVideo.findUnique({ where: { id: row.id } });
    return (next as Row | null) ?? row;
  }

  /** Encoding finished: enforce limits, then promote or reject. */
  private async finish(row: Row, video: BunnyVideo): Promise<Row> {
    const length = Math.round(video.length);
    if (length > MAX_VIDEO_SECONDS + SERVER_DURATION_TOLERANCE_SECONDS || length <= 0) {
      const reason =
        length <= 0
          ? "We could not read this video. Try a different file."
          : `Video is longer than ${MAX_VIDEO_SECONDS} seconds.`;
      return (await this.markFailed(row, reason, "rejected")) ?? row;
    }
    if (video.storageSize > MAX_STORED_BYTES) {
      return (await this.markFailed(row, "Video file is too large.", "rejected")) ?? row;
    }

    await this.prisma.$transaction(async (tx) => {
      const old = await tx.profileVideo.findFirst({
        where: { userId: row.userId, isActive: true, NOT: { id: row.id } },
      });
      const claim = await tx.profileVideo.updateMany({
        where: { id: row.id, status: { in: [...PENDING] } },
        data: {
          status: "ready",
          encodeProgress: 100,
          durationSec: length,
          readyAt: new Date(),
          lastCheckedAt: new Date(),
          failureReason: null,
          expiresAt: null,
          // isActive set below, after the old active row is gone (partial unique index).
        },
      });
      if (claim.count === 0) return; // someone else already finished this (webhook + poll)
      if (old) {
        await tx.bunnyVideoCleanup.upsert({
          where: { bunnyVideoId: old.bunnyVideoId },
          create: { bunnyVideoId: old.bunnyVideoId },
          update: {},
        });
        await tx.profileVideo.delete({ where: { id: old.id } });
      }
      await tx.profileVideo.update({
        where: { id: row.id },
        data: { isActive: true },
      });
    });
    void this.drainCleanup(5);
    const next = await this.prisma.profileVideo.findUnique({ where: { id: row.id } });
    return (next as Row | null) ?? row;
  }

  private async markFailed(
    row: Row,
    reason: string,
    status: "failed" | "rejected" = "failed"
  ): Promise<Row | null> {
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.profileVideo.updateMany({
        where: { id: row.id, status: { in: [...PENDING] } },
        data: { status, failureReason: reason, isActive: false, lastCheckedAt: new Date() },
      });
      if (res.count > 0) {
        await tx.bunnyVideoCleanup.upsert({
          where: { bunnyVideoId: row.bunnyVideoId },
          create: { bunnyVideoId: row.bunnyVideoId },
          update: {},
        });
      }
    });
    void this.drainCleanup(5);
    return (await this.prisma.profileVideo.findUnique({ where: { id: row.id } })) as Row | null;
  }

  // ───────────────────────── webhook ─────────────────────────

  /** Authenticated by the controller; re-reads state from Bunny, never trusts the payload. */
  async handleWebhook(payload: { videoLibraryId?: unknown; videoGuid?: unknown }) {
    const guid = typeof payload.videoGuid === "string" ? payload.videoGuid : "";
    if (!guid) return { handled: false as const };
    if (String(payload.videoLibraryId ?? "") !== this.bunny.getLibraryId()) {
      return { handled: false as const };
    }
    const row = (await this.prisma.profileVideo.findUnique({
      where: { bunnyVideoId: guid },
    })) as Row | null;
    if (!row) return { handled: false as const };
    await this.refresh(row, true);
    return { handled: true as const };
  }

  // ───────────────────────── delete ─────────────────────────

  /** Remove every video of this member (own delete, admin removal, account deletion). */
  async removeAllForUser(userId: string): Promise<string[]> {
    const rows = await this.prisma.profileVideo.findMany({
      where: { userId },
      select: { bunnyVideoId: true },
    });
    if (rows.length === 0) return [];
    await this.prisma.$transaction(async (tx) => {
      for (const r of rows) {
        await tx.bunnyVideoCleanup.upsert({
          where: { bunnyVideoId: r.bunnyVideoId },
          create: { bunnyVideoId: r.bunnyVideoId },
          update: {},
        });
      }
      await tx.profileVideo.deleteMany({ where: { userId } });
    });
    void this.drainCleanup(5);
    return rows.map((r) => r.bunnyVideoId);
  }

  // ───────────────────────── playback ─────────────────────────

  /** Same visibility rules as profile photos, plus the usual match-access gates. */
  async getPlayback(viewerUserId: string, ownerUserId: string) {
    const row = await this.prisma.profileVideo.findFirst({
      where: { userId: ownerUserId, isActive: true, status: "ready" },
    });
    if (!row) throw new NotFoundException("No video available.");

    if (viewerUserId !== ownerUserId) {
      const viewer = await this.prisma.profile.findUnique({ where: { userId: viewerUserId } });
      if (!viewer) throw new ForbiddenException("Profile required");
      const staff = isStaffRole(viewer.role);
      if (!staff) {
        if (isInteractionLocked(viewer)) {
          throw new ForbiddenException(interactionLockMessage(viewer));
        }
        if (!viewer.questionnaireComplete || !hasPaidAccess(viewer) || !isDiscoverable(viewer)) {
          throw new ForbiddenException("Complete your profile and payment to watch videos.");
        }
        const blocked = await this.prisma.block.findFirst({
          where: {
            OR: [
              { blockerId: viewerUserId, blockedId: ownerUserId },
              { blockerId: ownerUserId, blockedId: viewerUserId },
            ],
          },
          select: { id: true },
        });
        if (blocked) throw new NotFoundException("No video available.");
        const owner = await this.prisma.profile.findUnique({ where: { userId: ownerUserId } });
        if (!owner || !isDiscoverable(owner)) throw new NotFoundException("No video available.");
        const match = await this.prisma.match.findFirst({
          where: {
            status: "active",
            OR: [
              { userAId: viewerUserId, userBId: ownerUserId },
              { userAId: ownerUserId, userBId: viewerUserId },
            ],
          },
          select: { id: true },
        });
        const allowed = canViewerSeePhotos({
          viewerUserId,
          profileOwnerUserId: ownerUserId,
          photoVisibility: owner.photoVisibility,
          isStaff: false,
          hasActiveMatch: !!match,
        });
        if (!allowed) throw new ForbiddenException("This video is visible to matches only.");
      }
    }
    await this.assertPlayableAtBunny(row as Row);
    const { url, expiresAt } = await this.resolvePlayerLink(row.bunnyVideoId);
    return { url, expiresAt, durationSec: row.durationSec };
  }

  private workingHost: string | null = null;

  /**
   * Pick a player host that actually serves this video. A 404 from the player page means that
   * host does not know the video (wrong host for the library, or the video is gone); try the
   * other documented host before giving up. 403 and network errors are not treated as 404s.
   */
  private async resolvePlayerLink(videoId: string) {
    const hosts = this.bunny.playerHosts();
    const ordered = this.workingHost
      ? [this.workingHost, ...hosts.filter((h) => h !== this.workingHost)]
      : hosts;
    const results: string[] = [];
    for (const host of ordered) {
      const link = this.bunny.playbackUrl(videoId, Date.now(), host);
      const status = await this.bunny.probePlayer(link.url, "https://localhost/");
      if (status === null || (status !== 404 && status !== 410)) {
        this.workingHost = host;
        return link;
      }
      results.push(`${host}: HTTP ${status}`);
    }
    this.workingHost = null;
    this.logger.warn(`Player could not find video (${results.join(", ")})`);
    throw new BadGatewayException(
      `The video player could not find this video (${results.join("; ")}). Check BUNNY_STREAM_LIBRARY_ID and that the video exists in the library.`
    );
  }

  /**
   * Self-check for the member's own video: what Bunny says about the video and what each
   * player host answers for the signed and unsigned link. Contains no secrets (IDs and
   * HTTP statuses only), so the app can show it to the member to send to support.
   */
  async diagnose(userId: string) {
    const row = await this.prisma.profileVideo.findFirst({
      where: { userId, isActive: true, status: "ready" },
    });
    const out: Record<string, unknown> = {
      libraryConfigured: this.bunny.configured,
      tokenKeyConfigured: this.bunny.tokenKeyConfigured,
      webhookKeyConfigured: this.bunny.webhookConfigured,
      hasReadyVideo: Boolean(row),
    };
    if (!this.bunny.configured || !row) return out;
    out.libraryId = this.bunny.getLibraryId();
    out.videoId = row.bunnyVideoId;
    try {
      const v = await this.bunny.getVideo(row.bunnyVideoId);
      out.bunnyVideo = v
        ? {
            status: v.status,
            lengthSec: v.length,
            encodeProgress: v.encodeProgress,
            resolutions: v.availableResolutions,
          }
        : "not found at Bunny";
    } catch {
      out.bunnyVideo = "could not reach Bunny";
    }
    const probes: Array<Record<string, unknown>> = [];
    for (const host of this.bunny.playerHosts()) {
      const signed = this.bunny.playbackUrl(row.bunnyVideoId, Date.now(), host);
      const plain = this.bunny.playbackUrl(row.bunnyVideoId, Date.now(), host, true);
      probes.push({
        host,
        signedLink: await this.bunny.probePlayer(signed.url, "https://localhost/"),
        unsignedLink: await this.bunny.probePlayer(plain.url, "https://localhost/"),
      });
    }
    out.playerProbes = probes;
    out.workingHost = this.workingHost;
    return out;
  }

  private verifiedUntil = new Map<string, number>();

  /** Never hand out a player link for a video Bunny no longer has or has not finished. */
  private async assertPlayableAtBunny(row: Row) {
    const now = Date.now();
    if ((this.verifiedUntil.get(row.bunnyVideoId) ?? 0) > now) return;
    const video = await this.bunny.getVideo(row.bunnyVideoId);
    if (!video) {
      await this.prisma.profileVideo.deleteMany({ where: { id: row.id } });
      throw new NotFoundException("This video is no longer available. Please upload it again.");
    }
    if (video.status !== BUNNY_STATUS.finished) {
      throw new ConflictException("This video is still being prepared. Try again in a moment.");
    }
    if (this.verifiedUntil.size > 2000) this.verifiedUntil.clear();
    this.verifiedUntil.set(row.bunnyVideoId, now + 10 * 60_000);
  }

  // ───────────────────────── cleanup / maintenance ─────────────────────────

  async queueCleanup(bunnyVideoId: string) {
    await this.prisma.bunnyVideoCleanup.upsert({
      where: { bunnyVideoId },
      create: { bunnyVideoId },
      update: {},
    });
  }

  /** Delete queued Bunny videos; failures back off and retry later. */
  async drainCleanup(limit = CLEANUP_BATCH): Promise<number> {
    if (!this.bunny.configured) return 0;
    let done = 0;
    try {
      const due = await this.prisma.bunnyVideoCleanup.findMany({
        where: { nextAttemptAt: { lte: new Date() } },
        orderBy: { nextAttemptAt: "asc" },
        take: limit,
      });
      for (const item of due) {
        let ok = false;
        try {
          ok = await this.bunny.deleteVideo(item.bunnyVideoId);
        } catch {
          ok = false;
        }
        if (ok) {
          await this.prisma.bunnyVideoCleanup.deleteMany({
            where: { bunnyVideoId: item.bunnyVideoId },
          });
          done += 1;
        } else {
          const attempts = item.attempts + 1;
          const backoffMin = Math.min(24 * 60, 2 ** Math.min(attempts, 10));
          await this.prisma.bunnyVideoCleanup.update({
            where: { bunnyVideoId: item.bunnyVideoId },
            data: {
              attempts,
              lastError: "delete failed",
              nextAttemptAt: new Date(Date.now() + backoffMin * 60_000),
            },
          });
        }
      }
    } catch (err) {
      this.logger.warn(`cleanup run failed: ${err instanceof Error ? err.name : "unknown"}`);
    }
    return done;
  }

  /** Expire abandoned uploads, resolve stuck processing, drop old failure rows. */
  async maintenance() {
    try {
      const now = new Date();
      const stale = (await this.prisma.profileVideo.findMany({
        where: {
          status: { in: ["created", "uploading"] },
          expiresAt: { lt: new Date(now.getTime() - 10 * 60_000) },
        },
        take: 50,
      })) as Row[];
      for (const row of stale) {
        await this.markFailed(row, "Upload expired. Please try again.");
      }
      const stuck = (await this.prisma.profileVideo.findMany({
        where: { status: "processing" },
        orderBy: { updatedAt: "asc" },
        take: 20,
      })) as Row[];
      for (const row of stuck) {
        try {
          await this.refresh(row, true);
        } catch {
          /* retry next tick */
        }
      }
      await this.prisma.profileVideo.deleteMany({
        where: {
          status: { in: ["failed", "rejected"] },
          createdAt: { lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
        },
      });
      await this.drainCleanup();
    } catch (err) {
      this.logger.warn(`maintenance failed: ${err instanceof Error ? err.name : "unknown"}`);
    }
  }

  assertConfigured() {
    if (!this.bunny.configured) {
      throw new ServiceUnavailableException("Profile video is not available right now.");
    }
  }
}
