import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { MediaAccessService } from "../media/media-access.service";
import { assertStoredUpload, assertUploadIntent } from "../media/upload-policy";
import { PushService } from "../push/push.service";

const PROMPTS = [
  "Hold up two fingers",
  "Give a thumbs up",
  "Hold up three fingers",
  "Touch your chin with one finger",
  "Hold your open palm next to your face",
];

/** Selfie images are only needed for the review; keep them this long after the decision. */
const SELFIE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const PURGE_EVERY_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class VerificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VerificationService.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly bucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly media: MediaAccessService,
    private readonly push: PushService
  ) {
    this.bucket =
      this.config.get<string>("S3_BUCKET_PROFILE_PRIVATE") ??
      "hel-profile-private";
  }

  onModuleInit() {
    if (process.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => void this.purgeReviewedSelfies(), PURGE_EVERY_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Privacy: delete the selfie file and its record 30 days after staff decided. The verified
   * badge (profiles.photo_verified) is unaffected; the image itself is not kept longer than needed.
   */
  async purgeReviewedSelfies(now = Date.now()): Promise<number> {
    try {
      const rows = await this.prisma.photoVerification.findMany({
        where: {
          status: { in: ["approved", "rejected"] },
          reviewedAt: { lt: new Date(now - SELFIE_RETENTION_MS) },
        },
        take: 50,
      });
      for (const row of rows) {
        const media = await this.prisma.mediaObject.findUnique({
          where: { id: row.mediaId },
        });
        if (media?.bucket && media.objectKey) {
          await this.media.deleteObjectQuietly(media.bucket, media.objectKey);
        }
        await this.prisma.mediaObject.deleteMany({ where: { id: row.mediaId } });
        await this.prisma.photoVerification.delete({ where: { id: row.id } });
      }
      return rows.length;
    } catch (err) {
      this.logger.warn(
        `selfie purge failed: ${err instanceof Error ? err.name : "unknown"}`
      );
      return 0;
    }
  }

  private async requireProfile(userId: string) {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) throw new ForbiddenException("Profile required");
    return profile;
  }

  async status(userId: string) {
    const profile = await this.requireProfile(userId);
    const latest = await this.prisma.photoVerification.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    const prompt = PROMPTS[Math.floor(Math.random() * PROMPTS.length)]!;
    return {
      verified: profile.photoVerified,
      status: profile.photoVerified ? "approved" : (latest?.status ?? "none"),
      rejectReason:
        latest?.status === "rejected" && !profile.photoVerified
          ? (latest.rejectReason ?? null)
          : null,
      prompt,
    };
  }

  async signUpload(
    userId: string,
    opts: { contentType: string; sizeBytes?: number }
  ) {
    const profile = await this.requireProfile(userId);
    if (profile.photoVerified) {
      throw new BadRequestException("You are already verified.");
    }
    const { contentType, sizeBytes, maxBytes } = assertUploadIntent({
      purpose: "verification_selfie",
      contentType: opts.contentType,
      sizeBytes: opts.sizeBytes,
    });
    const ext =
      contentType === "image/png"
        ? "png"
        : contentType === "image/webp"
          ? "webp"
          : "jpg";
    const localStorageId = `local_verify_${randomUUID()}`;
    const objectKey = `verification/${userId}/${localStorageId}.${ext}`;
    const mediaRow = await this.prisma.mediaObject.create({
      data: {
        convexStorageId: localStorageId,
        purpose: "verification_selfie",
        bucket: this.bucket,
        objectKey,
        contentType,
        sizeBytes: BigInt(sizeBytes),
        ownerUserId: userId,
        convexOwnerUserId: profile.convexUserId,
        migrationStatus: "pending",
        sourceTable: "photo_verifications",
      },
    });
    const { uploadUrl, expiresInSeconds } =
      await this.media.createSignedUploadUrl({
        bucket: this.bucket,
        objectKey,
        contentType,
        contentLength: sizeBytes,
      });
    return { mediaId: mediaRow.id, uploadUrl, expiresInSeconds, contentType, maxBytes };
  }

  async submit(userId: string, mediaId: string, prompt: string) {
    const profile = await this.requireProfile(userId);
    if (profile.photoVerified) {
      throw new BadRequestException("You are already verified.");
    }
    const pending = await this.prisma.photoVerification.findFirst({
      where: { userId, status: "pending" },
    });
    if (pending) {
      throw new BadRequestException("Your selfie is already being reviewed.");
    }
    const media = await this.prisma.mediaObject.findUnique({
      where: { id: mediaId },
    });
    if (
      !media ||
      media.ownerUserId !== userId ||
      media.purpose !== "verification_selfie" ||
      !media.bucket ||
      !media.objectKey
    ) {
      throw new BadRequestException("Invalid selfie upload");
    }
    let head: { sizeBytes: number; contentType: string | null };
    try {
      head = await this.media.headObject(media.bucket, media.objectKey);
    } catch {
      throw new BadRequestException("Upload did not finish. Please try again.");
    }
    const declared =
      media.sizeBytes != null ? Number(media.sizeBytes) : undefined;
    const verified = assertStoredUpload({
      purpose: "verification_selfie",
      contentType: head.contentType ?? media.contentType,
      sizeBytes: head.sizeBytes,
      declaredSizeBytes: declared,
    });
    await this.prisma.mediaObject.update({
      where: { id: media.id },
      data: {
        sizeBytes: BigInt(verified.sizeBytes),
        contentType: verified.contentType,
        migrationStatus: "verified",
        verifiedReadable: true,
        migratedAt: new Date(),
      },
    });
    await this.prisma.photoVerification.create({
      data: { userId, mediaId, prompt: prompt.slice(0, 120) },
    });
    return { ok: true as const, status: "pending" as const };
  }

  // ---- staff ----

  async listForReview(
    staffUserId: string,
    staffRole: "admin" | "owner",
    status: "pending" | "approved" | "rejected" = "pending"
  ) {
    const rows = await this.prisma.photoVerification.findMany({
      where: { status },
      orderBy: { createdAt: "asc" },
      take: 50,
      include: {
        user: {
          select: {
            email: true,
            profile: {
              select: {
                id: true,
                name: true,
                age: true,
                profileImageMediaId: true,
              },
            },
          },
        },
      },
    });
    const ctx = { userId: staffUserId, roles: [staffRole] as ("admin" | "owner")[] };
    const sign = async (id: string | null | undefined) => {
      if (!id) return null;
      try {
        return (await this.media.createSignedDownloadUrl(id, ctx)).url;
      } catch {
        return null;
      }
    };
    return {
      items: await Promise.all(
        rows.map(async (r) => ({
          id: r.id,
          userId: r.userId,
          name: r.user.profile?.name ?? r.user.email ?? "Member",
          age: r.user.profile?.age ?? null,
          prompt: r.prompt,
          status: r.status,
          submittedAt: r.createdAt.toISOString(),
          selfieUrl: await sign(r.mediaId),
          profilePhotoUrl: await sign(r.user.profile?.profileImageMediaId),
        }))
      ),
    };
  }

  async pendingCount() {
    return {
      count: await this.prisma.photoVerification.count({
        where: { status: "pending" },
      }),
    };
  }

  private async load(id: string) {
    const row = await this.prisma.photoVerification.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException("Verification not found");
    if (row.status !== "pending") {
      throw new BadRequestException("Already reviewed");
    }
    return row;
  }

  private async notify(userId: string, title: string, body: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { convexId: true },
    });
    await this.prisma.notification.create({
      data: {
        convexId: `local_notif_${randomUUID()}`,
        userId,
        convexUserId: user?.convexId ?? `local_${userId}`,
        type: "approval",
        title,
        body,
        read: false,
        notificationCreatedAt: new Date(),
      },
    });
    void this.push.sendToUsers([userId], {
      title,
      body,
      data: { type: "approval", route: "/settings/verification" },
    });
  }

  async approve(staffUserId: string, id: string) {
    const row = await this.load(id);
    await this.prisma.$transaction([
      this.prisma.photoVerification.update({
        where: { id },
        data: { status: "approved", reviewedById: staffUserId, reviewedAt: new Date() },
      }),
      this.prisma.profile.update({
        where: { userId: row.userId },
        data: { photoVerified: true },
      }),
    ]);
    await this.notify(
      row.userId,
      "You are verified",
      "Your selfie was approved. A verified badge now shows on your profile."
    );
    return { ok: true as const };
  }

  async reject(staffUserId: string, id: string, reason: string) {
    const row = await this.load(id);
    await this.prisma.photoVerification.update({
      where: { id },
      data: {
        status: "rejected",
        rejectReason: reason.slice(0, 300),
        reviewedById: staffUserId,
        reviewedAt: new Date(),
      },
    });
    await this.notify(
      row.userId,
      "Verification not approved",
      `${reason.slice(0, 200)} You can try again with a new selfie.`
    );
    return { ok: true as const };
  }
}
