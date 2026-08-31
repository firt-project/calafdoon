import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable, ForbiddenException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { MediaPurpose } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export type MediaAccessContext = {
  /** Authenticated user UUID (Postgres). */
  userId: string;
  /** Profile roles for staff checks. */
  roles: Array<"user" | "admin" | "owner">;
  /** Conversation IDs the user participates in (Postgres UUIDs). */
  conversationIds?: string[];
  /** Match partner user IDs who may see private photos (explicit allow-list). */
  privatePhotoPeerIds?: string[];
};

/**
 * Phase 3 access rules for migrated media.
 * Never returns permanent public URLs — only short-lived signed GET URLs.
 */
@Injectable()
export class MediaAccessService {
  private readonly s3: S3Client;
  private readonly ttlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {
    const endpoint = this.config.get<string>("S3_ENDPOINT") ?? "http://127.0.0.1:9000";
    const region = this.config.get<string>("S3_REGION") ?? "us-east-1";
    const accessKeyId =
      this.config.get<string>("S3_ACCESS_KEY_ID") ??
      this.config.get<string>("MINIO_ROOT_USER") ??
      "";
    const secretAccessKey =
      this.config.get<string>("S3_SECRET_ACCESS_KEY") ??
      this.config.get<string>("MINIO_ROOT_PASSWORD") ??
      "";
    this.ttlSeconds = Number(
      this.config.get<string>("S3_SIGNED_URL_TTL_SECONDS") ?? 300
    );
    const forcePathStyle =
      this.config.get<string>("S3_FORCE_PATH_STYLE") === undefined
        ? true
        : this.config.get<string>("S3_FORCE_PATH_STYLE") === "true" ||
          this.config.get<string>("S3_FORCE_PATH_STYLE") === "1";
    this.s3 = new S3Client({
      endpoint,
      region,
      forcePathStyle,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async assertCanAccess(
    mediaId: string,
    ctx: MediaAccessContext
  ): Promise<{
    bucket: string;
    objectKey: string;
    purpose: MediaPurpose;
    contentType: string | null;
  }> {
    const media = await this.prisma.mediaObject.findUnique({
      where: { id: mediaId },
    });
    if (!media?.bucket || !media.objectKey) {
      throw new NotFoundException("Media not found");
    }

    const isStaff =
      ctx.roles.includes("admin") || ctx.roles.includes("owner");
    const isOwner = media.ownerUserId === ctx.userId;

    switch (media.purpose) {
      case "profile_main":
      case "profile_additional":
        // Authenticated discovery — caller must be signed in (ctx.userId present).
        if (!ctx.userId) throw new ForbiddenException("Authentication required");
        break;
      case "profile_private":
        if (
          !isOwner &&
          !isStaff &&
          !(ctx.privatePhotoPeerIds ?? []).includes(media.ownerUserId ?? "")
        ) {
          throw new ForbiddenException("Private photo access denied");
        }
        break;
      case "chat_image": {
        if (isStaff || isOwner) break;
        const msg = await this.prisma.message.findFirst({
          where: { imageMediaId: media.id },
          select: { conversationId: true },
        });
        if (
          !msg ||
          !(ctx.conversationIds ?? []).includes(msg.conversationId)
        ) {
          throw new ForbiddenException("Chat attachment access denied");
        }
        break;
      }
      case "support_attachment": {
        if (isStaff || isOwner) break;
        throw new ForbiddenException("Support attachment access denied");
      }
      case "evc_screenshot":
        if (!isOwner && !isStaff) {
          throw new ForbiddenException("EVC proof access denied");
        }
        break;
      case "unknown": {
        // Legacy migrated objects explicitly linked to a chat message.
        if (isStaff || isOwner) break;
        const linked = await this.prisma.message.findFirst({
          where: { imageMediaId: media.id },
          select: { conversationId: true },
        });
        if (
          linked &&
          (ctx.conversationIds ?? []).includes(linked.conversationId)
        ) {
          break;
        }
        throw new ForbiddenException("Media access denied");
      }
      default:
        if (!isOwner && !isStaff) {
          throw new ForbiddenException("Media access denied");
        }
    }

    return {
      bucket: media.bucket,
      objectKey: media.objectKey,
      purpose: media.purpose,
      contentType: media.contentType ?? null,
    };
  }

  async createSignedDownloadUrl(
    mediaId: string,
    ctx: MediaAccessContext
  ): Promise<{ url: string; expiresInSeconds: number; purpose: MediaPurpose }> {
    const { bucket, objectKey, purpose, contentType } =
      await this.assertCanAccess(mediaId, ctx);
    // Force a browser-friendly Content-Type so Firefox ORB does not treat
    // missing/mis-typed R2 responses as opaque blocked resources when possible.
    const responseType =
      contentType && contentType.trim()
        ? contentType
        : purpose.startsWith("profile") ||
            purpose === "evc_screenshot" ||
            purpose === "chat_image" ||
            purpose === "unknown"
          ? "image/jpeg"
          : "application/octet-stream";
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ResponseContentType: responseType,
      ResponseContentDisposition: "inline",
    });
    const url = await getSignedUrl(this.s3, command, {
      expiresIn: this.ttlSeconds,
    });
    return { url, expiresInSeconds: this.ttlSeconds, purpose };
  }

  /** Signed PUT URL for direct browser uploads (e.g. chat attachments). */
  async createSignedUploadUrl(opts: {
    bucket: string;
    objectKey: string;
    contentType: string;
  }): Promise<{ uploadUrl: string; expiresInSeconds: number }> {
    const command = new PutObjectCommand({
      Bucket: opts.bucket,
      Key: opts.objectKey,
      ContentType: opts.contentType,
    });
    const uploadUrl = await getSignedUrl(this.s3, command, {
      expiresIn: this.ttlSeconds,
    });
    return { uploadUrl, expiresInSeconds: this.ttlSeconds };
  }

  /** HEAD an uploaded object to verify it exists; returns size + content type. */
  async headObject(
    bucket: string,
    objectKey: string
  ): Promise<{ sizeBytes: number; contentType: string | null }> {
    const res = await this.s3.send(
      new HeadObjectCommand({ Bucket: bucket, Key: objectKey })
    );
    return {
      sizeBytes: Number(res.ContentLength ?? 0),
      contentType: res.ContentType ?? null,
    };
  }

  async getObjectStream(mediaId: string, ctx: MediaAccessContext) {
    const { bucket, objectKey, purpose, contentType } =
      await this.assertCanAccess(mediaId, ctx);
    const res = await this.s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: objectKey })
    );
    const resolvedType =
      contentType?.trim() ||
      res.ContentType ||
      (purpose.startsWith("profile") ||
      purpose === "evc_screenshot" ||
      purpose === "chat_image" ||
      purpose === "unknown"
        ? "image/jpeg"
        : "application/octet-stream");
    return {
      body: res.Body,
      contentType: resolvedType,
      contentLength: res.ContentLength,
      purpose,
    };
  }
}
