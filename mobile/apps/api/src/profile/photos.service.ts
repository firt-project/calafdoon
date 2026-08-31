import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { MediaAccessService } from "../media/media-access.service";
import { isStaffRole } from "../common/access";
import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  canViewerSeePhotos,
  MAX_ADDITIONAL_PHOTOS,
  MAX_PRIVATE_PHOTOS,
  MAX_PROFILE_PHOTOS,
  MAX_UPLOAD_BYTES,
} from "./photo-rules";
import { ProfileService } from "./profile.service";

@Injectable()
export class ProfilePhotosService {
  private readonly s3: S3Client;
  private readonly ttlSeconds: number;
  private readonly profileBucket: string;
  private readonly privateBucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mediaAccess: MediaAccessService,
    private readonly profiles: ProfileService
  ) {
    const endpoint =
      this.config.get<string>("S3_ENDPOINT") ?? "http://127.0.0.1:9000";
    this.s3 = new S3Client({
      endpoint,
      region: this.config.get<string>("S3_REGION") ?? "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId:
          this.config.get<string>("S3_ACCESS_KEY_ID") ??
          this.config.get<string>("MINIO_ROOT_USER") ??
          "",
        secretAccessKey:
          this.config.get<string>("S3_SECRET_ACCESS_KEY") ??
          this.config.get<string>("MINIO_ROOT_PASSWORD") ??
          "",
      },
    });
    this.ttlSeconds = Number(
      this.config.get<string>("S3_SIGNED_URL_TTL_SECONDS") ?? 300
    );
    this.profileBucket =
      this.config.get<string>("S3_BUCKET_PROFILE") ?? "hel-profile";
    this.privateBucket =
      this.config.get<string>("S3_BUCKET_PROFILE_PRIVATE") ??
      "hel-profile-private";
  }

  async listMine(userId: string) {
    const profile = await this.profiles.requireProfile(userId);
    const photos = await this.resolvePhotoList(profile);
    const signed = [];
    for (const photo of photos) {
      if (!photo.mediaId) {
        signed.push({ ...photo, url: null });
        continue;
      }
      try {
        const { url, expiresInSeconds } =
          await this.mediaAccess.createSignedDownloadUrl(photo.mediaId, {
            userId,
            roles: [profile.role],
          });
        signed.push({ ...photo, url, expiresInSeconds });
      } catch {
        signed.push({ ...photo, url: null });
      }
    }
    return {
      photoVisibility: profile.photoVisibility ?? "everyone",
      maxPhotos: MAX_PROFILE_PHOTOS,
      photos: signed,
    };
  }

  async signUpload(
    userId: string,
    opts: {
      contentType: string;
      slot: "main" | "additional" | "private";
      sizeBytes?: number;
    }
  ) {
    const profile = await this.profiles.requireProfile(userId);
    const contentType = opts.contentType.toLowerCase().trim();
    if (!ALLOWED_IMAGE_CONTENT_TYPES.has(contentType)) {
      throw new BadRequestException(
        "Only JPG, PNG, or WebP images are allowed"
      );
    }
    if (opts.sizeBytes !== undefined && opts.sizeBytes > MAX_UPLOAD_BYTES) {
      throw new BadRequestException(
        "Image is too large. Please choose a photo under 2MB after compression."
      );
    }

    const counts = await this.countPhotos(profile);
    if (opts.slot === "private") {
      if (profile.privateImageMediaIds.length >= MAX_PRIVATE_PHOTOS) {
        throw new BadRequestException(
          `You can upload up to ${MAX_PRIVATE_PHOTOS} private photos`
        );
      }
    } else if (opts.slot === "additional") {
      // "main" always replaces the existing photo, so only the additional
      // slot can push the gallery past its limits.
      if (counts.total >= MAX_PROFILE_PHOTOS) {
        throw new BadRequestException(
          `You can upload up to ${MAX_PROFILE_PHOTOS} photos`
        );
      }
      if (counts.additional >= MAX_ADDITIONAL_PHOTOS) {
        throw new BadRequestException(
          `You can upload up to ${MAX_ADDITIONAL_PHOTOS} extra photos`
        );
      }
    }

    const purpose =
      opts.slot === "main"
        ? "profile_main"
        : opts.slot === "additional"
          ? "profile_additional"
          : "profile_private";
    const bucket =
      opts.slot === "private" ? this.privateBucket : this.profileBucket;
    const ext =
      contentType.includes("png")
        ? "png"
        : contentType.includes("webp")
          ? "webp"
          : "jpg";
    const localStorageId = `local_${randomUUID()}`;
    const objectKey = `${userId}/${localStorageId}.${ext}`;

    const media = await this.prisma.mediaObject.create({
      data: {
        convexStorageId: localStorageId,
        purpose,
        bucket,
        objectKey,
        contentType,
        ownerUserId: userId,
        convexOwnerUserId: profile.convexUserId,
        migrationStatus: "pending",
        sourceTable: "profiles",
        sourceRecordConvexId: profile.convexId,
      },
    });

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(this.s3, command, {
      expiresIn: this.ttlSeconds,
    });

    await this.prisma.profileAuditEvent.create({
      data: {
        userId,
        profileId: profile.id,
        action: "photo_sign_upload",
        metadata: { mediaId: media.id, slot: opts.slot },
      },
    });

    return {
      mediaId: media.id,
      uploadUrl,
      expiresInSeconds: this.ttlSeconds,
      bucket,
      objectKey,
      contentType,
      maxBytes: MAX_UPLOAD_BYTES,
    };
  }

  async confirmUpload(
    userId: string,
    opts: { mediaId: string; setAsMain?: boolean }
  ) {
    const profile = await this.profiles.requireProfile(userId);
    const media = await this.prisma.mediaObject.findUnique({
      where: { id: opts.mediaId },
    });
    if (!media || media.ownerUserId !== userId) {
      throw new ForbiddenException("Invalid file upload");
    }
    if (!media.bucket || !media.objectKey) {
      throw new BadRequestException("Upload not ready");
    }

    const head = await this.s3.send(
      new HeadObjectCommand({
        Bucket: media.bucket,
        Key: media.objectKey,
      })
    );
    const size = Number(head.ContentLength ?? 0);
    const contentType = (head.ContentType ?? media.contentType ?? "")
      .toLowerCase()
      .trim();
    if (!ALLOWED_IMAGE_CONTENT_TYPES.has(contentType)) {
      throw new BadRequestException(
        "Only JPG, PNG, or WebP images are allowed"
      );
    }
    if (size <= 0 || size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException(
        "Image is too large. Please choose a photo under 2MB after compression."
      );
    }

    await this.prisma.mediaObject.update({
      where: { id: media.id },
      data: {
        sizeBytes: BigInt(size),
        contentType,
        migrationStatus: "verified",
        verifiedReadable: true,
        migratedAt: new Date(),
      },
    });

    const existingUpload = await this.prisma.userUpload.findFirst({
      where: { mediaObjectId: media.id },
    });
    if (!existingUpload) {
      await this.prisma.userUpload.create({
        data: {
          convexId: ProfileService.localId("local_upload"),
          userId,
          convexUserId: profile.convexUserId,
          convexStorageId: media.convexStorageId,
          mediaObjectId: media.id,
          uploadedAt: new Date(),
        },
      });
    }

    const counts = await this.countPhotos(profile);
    const setAsMain =
      opts.setAsMain === true ||
      media.purpose === "profile_main" ||
      (!profile.profileImageMediaId && !profile.profileImageConvexId);

    if (media.purpose === "profile_private") {
      if (profile.privateImageMediaIds.includes(media.id)) {
        return this.listMine(userId);
      }
      if (profile.privateImageMediaIds.length >= MAX_PRIVATE_PHOTOS) {
        throw new BadRequestException(
          `You can upload up to ${MAX_PRIVATE_PHOTOS} private photos`
        );
      }
      const next = [...profile.privateImageMediaIds, media.id];
      await this.prisma.profile.update({
        where: { id: profile.id },
        data: { privateImageMediaIds: next },
      });
    } else if (setAsMain) {
      await this.prisma.profile.update({
        where: { id: profile.id },
        data: {
          profileImageMediaId: media.id,
          profileImageConvexId: media.convexStorageId,
        },
      });
      await this.prisma.mediaObject.update({
        where: { id: media.id },
        data: { purpose: "profile_main" },
      });
    } else {
      if (counts.total >= MAX_PROFILE_PHOTOS) {
        throw new BadRequestException(
          `You can upload up to ${MAX_PROFILE_PHOTOS} photos`
        );
      }
      if (counts.additional >= MAX_ADDITIONAL_PHOTOS) {
        throw new BadRequestException(
          `You can upload up to ${MAX_ADDITIONAL_PHOTOS} extra photos`
        );
      }
      // Idempotent: confirm may be called twice (upload helper + legacy addAdditional).
      if (!profile.additionalImageMediaIds.includes(media.id)) {
        await this.prisma.profile.update({
          where: { id: profile.id },
          data: {
            additionalImageMediaIds: [
              ...profile.additionalImageMediaIds,
              media.id,
            ],
            additionalImageConvexIds: [
              ...profile.additionalImageConvexIds,
              media.convexStorageId,
            ],
          },
        });
      }
      await this.prisma.mediaObject.update({
        where: { id: media.id },
        data: { purpose: "profile_additional" },
      });
    }

    await this.prisma.profileAuditEvent.create({
      data: {
        userId,
        profileId: profile.id,
        action: "photo_confirm",
        metadata: { mediaId: media.id, setAsMain },
      },
    });

    return this.listMine(userId);
  }

  async deletePhoto(userId: string, mediaIdOrConvexId: string) {
    const profile = await this.profiles.requireProfile(userId);
    const media = await this.resolveMediaRef(mediaIdOrConvexId);
    if (!media || media.ownerUserId !== userId) {
      throw new NotFoundException("Photo not found");
    }

    const isMain =
      profile.profileImageMediaId === media.id ||
      profile.profileImageConvexId === media.convexStorageId;
    const inAdditionalMedia = profile.additionalImageMediaIds.includes(
      media.id
    );
    const inAdditionalConvex = profile.additionalImageConvexIds.includes(
      media.convexStorageId
    );
    const inPrivate = profile.privateImageMediaIds.includes(media.id);

    if (!isMain && !inAdditionalMedia && !inAdditionalConvex && !inPrivate) {
      throw new NotFoundException("Photo not found");
    }

    await this.prisma.profile.update({
      where: { id: profile.id },
      data: {
        ...(isMain
          ? { profileImageMediaId: null, profileImageConvexId: null }
          : {}),
        additionalImageMediaIds: profile.additionalImageMediaIds.filter(
          (id) => id !== media.id
        ),
        additionalImageConvexIds: profile.additionalImageConvexIds.filter(
          (id) => id !== media.convexStorageId
        ),
        privateImageMediaIds: profile.privateImageMediaIds.filter(
          (id) => id !== media.id
        ),
      },
    });

    await this.prisma.profileAuditEvent.create({
      data: {
        userId,
        profileId: profile.id,
        action: "photo_delete",
        metadata: { mediaId: media.id },
      },
    });

    return this.listMine(userId);
  }

  async reorder(userId: string, orderedMediaIds: string[]) {
    const profile = await this.profiles.requireProfile(userId);
    if (orderedMediaIds.length === 0) {
      throw new BadRequestException("orderedMediaIds required");
    }
    const [main, ...rest] = orderedMediaIds;
    if (rest.length > MAX_ADDITIONAL_PHOTOS) {
      throw new BadRequestException(
        `You can upload up to ${MAX_ADDITIONAL_PHOTOS} extra photos`
      );
    }

    const owned = await this.prisma.mediaObject.findMany({
      where: { id: { in: orderedMediaIds }, ownerUserId: userId },
    });
    if (owned.length !== orderedMediaIds.length) {
      throw new ForbiddenException("Photo ownership check failed");
    }

    const byId = new Map(owned.map((m) => [m.id, m]));
    await this.prisma.profile.update({
      where: { id: profile.id },
      data: {
        profileImageMediaId: main,
        profileImageConvexId: byId.get(main)?.convexStorageId ?? null,
        additionalImageMediaIds: rest,
        additionalImageConvexIds: rest.map(
          (id) => byId.get(id)?.convexStorageId ?? id
        ),
      },
    });

    await this.prisma.profileAuditEvent.create({
      data: {
        userId,
        profileId: profile.id,
        action: "photo_reorder",
        metadata: { count: orderedMediaIds.length },
      },
    });

    return this.listMine(userId);
  }

  /**
   * Signed access for a profile photo with visibility rules.
   * Never exposes private photos through a generic discovery path.
   */
  async photoAccess(
    viewerUserId: string,
    targetProfileId: string,
    mediaId: string
  ) {
    const viewer = await this.prisma.profile.findUnique({
      where: { userId: viewerUserId },
    });
    const target = await this.prisma.profile.findUnique({
      where: { id: targetProfileId },
    });
    if (!target || target.banned) {
      throw new NotFoundException("Profile not found");
    }

    const media = await this.prisma.mediaObject.findUnique({
      where: { id: mediaId },
    });
    if (!media || media.ownerUserId !== target.userId) {
      throw new NotFoundException("Photo not found");
    }

    if (media.purpose === "profile_private") {
      const isOwner = viewerUserId === target.userId;
      const isStaff = isStaffRole(viewer?.role);
      if (!isOwner && !isStaff) {
        const revealed = await this.prisma.photoReveal.findFirst({
          where: {
            viewerUserId,
            ownerUserId: target.userId,
            mediaId,
          },
          select: { id: true },
        });
        if (!revealed) {
          throw new ForbiddenException("Private photo access denied");
        }
        // Already revealed for this viewer — skip main-gallery visibility gate.
        return this.mediaAccess.createSignedDownloadUrl(mediaId, {
          userId: viewerUserId,
          roles: viewer ? [viewer.role] : ["user"],
          privatePhotoPeerIds: [target.userId],
        });
      }
    }

    const hasActiveMatch =
      viewerUserId === target.userId
        ? true
        : await this.hasActiveMatch(viewerUserId, target.userId);

    const allowed = canViewerSeePhotos({
      viewerUserId,
      profileOwnerUserId: target.userId,
      photoVisibility: target.photoVisibility,
      isStaff: isStaffRole(viewer?.role),
      hasActiveMatch,
    });
    if (!allowed) {
      throw new ForbiddenException("Photo visibility restricted");
    }

    return this.mediaAccess.createSignedDownloadUrl(mediaId, {
      userId: viewerUserId,
      roles: viewer ? [viewer.role] : ["user"],
      privatePhotoPeerIds:
        media.purpose === "profile_private" && hasActiveMatch
          ? [target.userId]
          : [],
    });
  }

  private async hasActiveMatch(a: string, b: string): Promise<boolean> {
    const match = await this.prisma.match.findFirst({
      where: {
        status: "active",
        OR: [
          { userAId: a, userBId: b },
          { userAId: b, userBId: a },
        ],
      },
      select: { id: true },
    });
    return !!match;
  }

  private async resolveMediaRef(idOrConvex: string) {
    return (
      (await this.prisma.mediaObject.findUnique({ where: { id: idOrConvex } })) ??
      (await this.prisma.mediaObject.findUnique({
        where: { convexStorageId: idOrConvex },
      }))
    );
  }

  private async countPhotos(profile: {
    profileImageMediaId: string | null;
    profileImageConvexId: string | null;
    additionalImageMediaIds: string[];
    additionalImageConvexIds: string[];
  }) {
    const hasMain = !!(
      profile.profileImageMediaId || profile.profileImageConvexId
    );
    const additional = Math.max(
      profile.additionalImageMediaIds.length,
      profile.additionalImageConvexIds.length
    );
    return { hasMain, additional, total: (hasMain ? 1 : 0) + additional };
  }

  private async resolvePhotoList(profile: {
    profileImageMediaId: string | null;
    profileImageConvexId: string | null;
    additionalImageMediaIds: string[];
    additionalImageConvexIds: string[];
    privateImageMediaIds: string[];
    privateImageConvexIds: string[];
  }) {
    const photos: Array<{
      role: "main" | "additional" | "private";
      mediaId: string | null;
      convexStorageId: string | null;
      order: number;
    }> = [];

    const mainMedia =
      (profile.profileImageMediaId &&
        (await this.prisma.mediaObject.findUnique({
          where: { id: profile.profileImageMediaId },
        }))) ||
      (profile.profileImageConvexId
        ? await this.prisma.mediaObject.findUnique({
            where: { convexStorageId: profile.profileImageConvexId },
          })
        : null);

    if (mainMedia || profile.profileImageConvexId) {
      photos.push({
        role: "main",
        mediaId: mainMedia?.id ?? profile.profileImageMediaId,
        convexStorageId:
          mainMedia?.convexStorageId ?? profile.profileImageConvexId,
        order: 0,
      });
    }

    if (profile.additionalImageMediaIds.length > 0) {
      let i = 1;
      for (const id of profile.additionalImageMediaIds) {
        const m = await this.prisma.mediaObject.findUnique({ where: { id } });
        photos.push({
          role: "additional",
          mediaId: m?.id ?? id,
          convexStorageId: m?.convexStorageId ?? null,
          order: i++,
        });
      }
    } else {
      let i = 1;
      for (const cid of profile.additionalImageConvexIds) {
        const m = await this.prisma.mediaObject.findUnique({
          where: { convexStorageId: cid },
        });
        photos.push({
          role: "additional",
          mediaId: m?.id ?? null,
          convexStorageId: cid,
          order: i++,
        });
      }
    }

    // Private list is owner-only metadata; URLs still gated elsewhere.
    for (const id of profile.privateImageMediaIds) {
      photos.push({
        role: "private",
        mediaId: id,
        convexStorageId: null,
        order: photos.length,
      });
    }

    return photos;
  }
}
