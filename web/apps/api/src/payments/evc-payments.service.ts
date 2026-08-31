import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  forwardRef,
} from "@nestjs/common";
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { isStaffRole, hasPaidAccess } from "../common/access";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.module";
import { MediaAccessService } from "../media/media-access.service";
import {
  assertStoredUpload,
  assertUploadIntent,
  UPLOAD_MAX_BYTES,
} from "../media/upload-policy";
import { ChatRealtimeService } from "../chat/chat-realtime.service";
import { PaymentMailService } from "../mail/payment-mail.service";
import { GrantPaidAccessService } from "./grant-paid-access.service";
import { MetricsService } from "../admin/metrics.service";
import {
  amountForEvcTier,
  PREMIUM_UPGRADE_AMOUNT_CENTS,
  type RegistrationTier,
} from "./pricing";
import { assertEvcClaimed, claimEvcProofReview } from "./evc-review-claim";

const MAX_BYTES = UPLOAD_MAX_BYTES.evc_screenshot;

@Injectable()
export class EvcPaymentsService {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly ttlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly media: MediaAccessService,
    private readonly grant: GrantPaidAccessService,
    private readonly mail: PaymentMailService,
    private readonly realtime: ChatRealtimeService,
    @Inject(forwardRef(() => MetricsService))
    private readonly metrics: MetricsService
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
    this.bucket = this.config.get<string>("S3_BUCKET_EVC") ?? "hel-evc";
    this.ttlSeconds = Number(
      this.config.get<string>("S3_SIGNED_URL_TTL_SECONDS") ?? 300
    );
  }

  private async failClosed(userId: string) {
    const online = await this.redis.connect();
    if (!online || !this.redis.client) {
      throw new ServiceUnavailableException(
        "Service temporarily unavailable. Try again later."
      );
    }
    const key = `rl:payments.evc:user:${userId}`;
    const count = await this.redis.client.incr(key);
    if (count === 1) await this.redis.client.expire(key, 60);
    if (count > 20) {
      throw new ServiceUnavailableException("Too many requests. Try again later.");
    }
  }

  async signUpload(
    userId: string,
    opts: { contentType: string; sizeBytes?: number }
  ) {
    await this.failClosed(userId);
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) throw new ForbiddenException("Profile required");
    if (profile.banned) throw new ForbiddenException("Account suspended");

    const { contentType, sizeBytes } = assertUploadIntent({
      purpose: "evc_screenshot",
      contentType: opts.contentType,
      sizeBytes: opts.sizeBytes,
    });

    const mediaId = randomUUID();
    const ext =
      contentType === "image/png"
        ? "png"
        : contentType === "image/webp"
          ? "webp"
          : "jpg";
    const objectKey = `${userId}/${mediaId}.${ext}`;
    await this.prisma.mediaObject.create({
      data: {
        id: mediaId,
        convexStorageId: `local_evc_${mediaId}`,
        purpose: "evc_screenshot",
        bucket: this.bucket,
        objectKey,
        contentType,
        sizeBytes: BigInt(sizeBytes),
        ownerUserId: userId,
        migrationStatus: "pending",
      },
    });

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: contentType,
      ContentLength: sizeBytes,
    });
    const uploadUrl = await getSignedUrl(this.s3, command, {
      expiresIn: this.ttlSeconds,
    });

    return {
      mediaId,
      uploadUrl,
      expiresInSeconds: this.ttlSeconds,
      headers: { "Content-Type": contentType },
      maxBytes: MAX_BYTES,
    };
  }

  /**
   * Mobile-friendly EVC screenshot upload: base64 (or data-URL) in JSON.
   * Avoids cross-origin PUT to S3 from Capacitor WebViews.
   */
  async uploadProofImage(
    userId: string,
    opts: {
      contentType: string;
      dataBase64: string;
      sizeBytes?: number;
    }
  ) {
    await this.failClosed(userId);
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) throw new ForbiddenException("Profile required");
    if (profile.banned) throw new ForbiddenException("Account suspended");

    let raw = opts.dataBase64.trim();
    const dataUrl = /^data:([^;]+);base64,(.+)$/i.exec(raw);
    if (dataUrl) {
      const declared = dataUrl[1].toLowerCase();
      if (declared !== opts.contentType.toLowerCase().trim()) {
        throw new BadRequestException("contentType does not match data URL");
      }
      raw = dataUrl[2];
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(raw, "base64");
    } catch {
      throw new BadRequestException("Invalid base64 image data");
    }
    if (!buffer.length) {
      throw new BadRequestException("Empty image data");
    }

    const { contentType } = assertUploadIntent({
      purpose: "evc_screenshot",
      contentType: opts.contentType,
      sizeBytes: buffer.length,
    });
    if (opts.sizeBytes && Math.abs(opts.sizeBytes - buffer.length) > 1024) {
      throw new BadRequestException("sizeBytes does not match payload");
    }

    const mediaId = randomUUID();
    const ext =
      contentType === "image/png"
        ? "png"
        : contentType === "image/webp"
          ? "webp"
          : "jpg";
    const objectKey = `${userId}/${mediaId}.${ext}`;

    await this.prisma.mediaObject.create({
      data: {
        id: mediaId,
        convexStorageId: `local_evc_${mediaId}`,
        purpose: "evc_screenshot",
        bucket: this.bucket,
        objectKey,
        contentType,
        sizeBytes: BigInt(buffer.length),
        ownerUserId: userId,
        migrationStatus: "pending",
      },
    });

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
          Body: buffer,
          ContentType: contentType,
          ContentLength: buffer.length,
        })
      );
      await this.prisma.mediaObject.update({
        where: { id: mediaId },
        data: {
          migrationStatus: "uploaded",
          verifiedReadable: true,
        },
      });
    } catch (err) {
      await this.media.deleteObjectQuietly(this.bucket, objectKey);
      await this.prisma.mediaObject
        .update({
          where: { id: mediaId },
          data: {
            migrationStatus: "failed",
            failureReason:
              err instanceof Error ? err.message.slice(0, 200) : "upload_failed",
          },
        })
        .catch(() => undefined);
      throw new ServiceUnavailableException(
        "Could not store payment screenshot. Try again."
      );
    }

    return {
      mediaId,
      sizeBytes: buffer.length,
      contentType,
    };
  }

  async submitProof(
    userId: string,
    opts: {
      tier: RegistrationTier;
      payerFullName: string;
      lastFourDigits: string;
      mediaId: string;
    }
  ) {
    await this.failClosed(userId);
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) throw new ForbiddenException("Profile required");
    if (profile.banned) throw new ForbiddenException("Account suspended");

    const isPremiumUpgrade =
      hasPaidAccess(profile) &&
      profile.hasPersonalSupport !== true &&
      opts.tier === "premium";

    if (hasPaidAccess(profile) && !isPremiumUpgrade) {
      throw new BadRequestException("You already have paid access.");
    }

    const name = opts.payerFullName.trim();
    if (name.length < 3 || name.length > 120) {
      throw new BadRequestException("Please enter your full name.");
    }
    const lastFour = opts.lastFourDigits.replace(/\D/g, "").slice(-4);
    if (lastFour.length !== 4) {
      throw new BadRequestException(
        "Enter the last 4 digits of the phone you paid from."
      );
    }

    const media = await this.prisma.mediaObject.findUnique({
      where: { id: opts.mediaId },
    });
    if (!media || media.ownerUserId !== userId) {
      throw new ForbiddenException("Invalid file upload");
    }
    if (media.purpose !== "evc_screenshot") {
      throw new BadRequestException("Screenshot must be an EVC upload");
    }
    if (media.bucket && media.objectKey) {
      if (media.migrationStatus === "uploaded" && media.verifiedReadable) {
        // Already confirmed (e2e / retry) — still enforce size if known.
        if (media.sizeBytes != null && Number(media.sizeBytes) > MAX_BYTES) {
          throw new BadRequestException("File too large");
        }
      } else {
        let head: { ContentLength?: number; ContentType?: string };
        try {
          head = await this.s3.send(
            new HeadObjectCommand({
              Bucket: media.bucket,
              Key: media.objectKey,
            })
          );
        } catch {
          throw new BadRequestException("Upload not found in storage");
        }
        const size = Number(head.ContentLength ?? 0);
        const declared =
          media.sizeBytes != null ? Number(media.sizeBytes) : undefined;
        try {
          const verified = assertStoredUpload({
            purpose: "evc_screenshot",
            contentType: head.ContentType ?? media.contentType,
            sizeBytes: size,
            declaredSizeBytes: declared,
          });
          await this.prisma.mediaObject.update({
            where: { id: media.id },
            data: {
              migrationStatus: "uploaded",
              verifiedReadable: true,
              sizeBytes: BigInt(verified.sizeBytes),
              contentType: verified.contentType,
            },
          });
        } catch (err) {
          await this.media.deleteObjectQuietly(media.bucket, media.objectKey);
          await this.prisma.mediaObject
            .update({
              where: { id: media.id },
              data: {
                migrationStatus: "failed",
                failureReason: "upload_validation_failed",
                verifiedReadable: false,
              },
            })
            .catch(() => undefined);
          throw err;
        }
      }
    }

    const pending = await this.prisma.evcPaymentProof.findFirst({
      where: { userId, status: "pending" },
    });
    if (pending) {
      throw new BadRequestException(
        "You already have a payment proof waiting for admin review."
      );
    }

    const amountCents = isPremiumUpgrade
      ? PREMIUM_UPGRADE_AMOUNT_CENTS
      : amountForEvcTier(opts.tier, profile.gender);

    const proof = await this.prisma.evcPaymentProof.create({
      data: {
        convexId: `local_evc_${randomUUID()}`,
        userId,
        profileId: profile.id,
        convexUserId: profile.convexUserId,
        convexProfileId: profile.convexId,
        tier: opts.tier,
        payerFullName: name,
        lastFourDigits: lastFour,
        screenshotConvexId: media.convexStorageId,
        screenshotMediaId: media.id,
        amountCents,
        status: "pending",
        proofCreatedAt: new Date(),
      },
    });

    // Side effects must not fail the HTTP submit if mail queue rejects a job id.
    try {
      await this.mail.queueEvcSubmitted(userId, proof.id);
      await this.mail.queueAdminEvcAlert({
        proofId: proof.id,
        memberName: profile.name,
        amountCents,
      });
    } catch {
      // ignore
    }

    return { proofId: proof.id };
  }

  async myLatest(userId: string) {
    const proof = await this.prisma.evcPaymentProof.findFirst({
      where: { userId },
      orderBy: { proofCreatedAt: "desc" },
    });
    if (!proof) return null;

    let screenshotUrl: string | null = null;
    if (proof.screenshotMediaId) {
      try {
        const profile = await this.prisma.profile.findUnique({
          where: { userId },
        });
        const signed = await this.media.createSignedDownloadUrl(
          proof.screenshotMediaId,
          { userId, roles: [profile?.role ?? "user"] }
        );
        screenshotUrl = signed.url;
      } catch {
        screenshotUrl = null;
      }
    }

    return {
      id: proof.id,
      tier: proof.tier,
      status: proof.status,
      amountCents: proof.amountCents,
      payerFullName: proof.payerFullName,
      lastFourDigits: proof.lastFourDigits,
      rejectionReason: proof.rejectionReason,
      createdAt: proof.proofCreatedAt.toISOString(),
      screenshotUrl,
    };
  }

  /** Staff-only — used in local e2e with admin fixture. */
  async listPending(actorUserId: string) {
    await this.requireStaff(actorUserId);
    const actor = await this.prisma.profile.findUnique({
      where: { userId: actorUserId },
      select: { role: true },
    });
    const pending = await this.prisma.evcPaymentProof.findMany({
      where: { status: "pending" },
      orderBy: { proofCreatedAt: "desc" },
      take: 100,
      include: {
        user: { select: { email: true, phone: true } },
        profile: {
          select: { name: true, phone: true, gender: true, hasPaid: true },
        },
      },
    });
    // Stripe payers already unlocked — hide leftover proofs from the admin queue.
    const needsReview = pending.filter((p) => !p.profile?.hasPaid);
    return Promise.all(
      needsReview.map(async (p) => {
        let screenshotUrl: string | null = null;
        let mediaId = p.screenshotMediaId;
        if (!mediaId && p.screenshotConvexId) {
          const media = await this.prisma.mediaObject.findUnique({
            where: { convexStorageId: p.screenshotConvexId },
            select: { id: true },
          });
          mediaId = media?.id ?? null;
        }
        if (mediaId) {
          try {
            const signed = await this.media.createSignedDownloadUrl(mediaId, {
              userId: actorUserId,
              roles: [actor?.role ?? "admin"],
            });
            screenshotUrl = signed.url;
          } catch {
            screenshotUrl = null;
          }
        }
        return {
          // Admin UI expects Convex-style `_id` for approve/reject routes.
          _id: p.id,
          id: p.id,
          userId: p.userId,
          tier: p.tier,
          amountCents: p.amountCents,
          payerFullName: p.payerFullName,
          lastFourDigits: p.lastFourDigits,
          createdAt: p.proofCreatedAt.toISOString(),
          screenshotUrl,
          userEmail: p.user.email,
          userPhone: p.profile.phone ?? p.user.phone ?? null,
          profileName: p.profile.name,
          gender: p.profile.gender,
        };
      })
    );
  }

  async approveProof(actorUserId: string, proofId: string) {
    await this.requireStaff(actorUserId);

    // M7: claim pending → approved atomically before payment/grant side effects.
    const claim = await claimEvcProofReview(this.prisma, {
      proofId,
      actorUserId,
      status: "approved",
    });
    assertEvcClaimed(claim);
    const proof = claim.proof;

    const profile = await this.prisma.profile.findUnique({
      where: { id: proof.profileId },
    });
    const isPremium = proof.tier === "premium";
    const isUpgrade =
      isPremium &&
      profile?.hasPaid === true &&
      profile?.hasPersonalSupport !== true;
    const paymentType = isUpgrade
      ? "premium_upgrade"
      : isPremium
        ? "registration_premium"
        : "registration";

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: proof.userId },
    });

    const sessionKey = `evc:${proof.id}`;
    let payment = await this.prisma.payment.findUnique({
      where: { stripeSessionId: sessionKey },
    });
    if (!payment) {
      try {
        payment = await this.prisma.payment.create({
          data: {
            convexId: `local_evc_pay_${randomUUID()}`,
            userId: proof.userId,
            convexUserId: user.convexId,
            stripeSessionId: sessionKey,
            amount: proof.amountCents,
            paymentType,
            registrationTier: proof.tier,
            status: "pending",
            paymentCreatedAt: new Date(),
          },
        });
      } catch (err: unknown) {
        const code =
          err && typeof err === "object" && "code" in err
            ? (err as { code?: string }).code
            : undefined;
        if (code !== "P2002") throw err;
        payment = await this.prisma.payment.findUniqueOrThrow({
          where: { stripeSessionId: sessionKey },
        });
      }
    }

    // Idempotent on fulfillmentKey / completed payment (safe if retried).
    await this.grant.applyPaymentCompletion({
      paymentId: payment.id,
      source: "evc",
      fulfillmentKey: sessionKey,
      forceProfileApproval: true,
    });

    await this.prisma.auditLog.create({
      data: {
        convexId: `local_audit_${randomUUID()}`,
        actorUserId,
        convexActorUserId: (
          await this.prisma.user.findUniqueOrThrow({ where: { id: actorUserId } })
        ).convexId,
        action: "evc_payment_approved",
        targetUserId: proof.userId,
        targetProfileId: proof.profileId,
        loggedAt: new Date(),
        metadata: JSON.stringify({
          proofId: proof.id,
          paymentId: payment.id,
          tier: proof.tier,
        }),
      },
    });

    await this.metrics.scheduleRebuild();

    return { ok: true as const };
  }

  async rejectProof(
    actorUserId: string,
    proofId: string,
    reason?: string
  ) {
    await this.requireStaff(actorUserId);

    const rejectionReason = (reason ?? "").trim().slice(0, 500) || null;

    // M7: claim pending → rejected atomically (exclusive with approve).
    const claim = await claimEvcProofReview(this.prisma, {
      proofId,
      actorUserId,
      status: "rejected",
      rejectionReason,
    });
    assertEvcClaimed(claim);
    const proof = claim.proof;

    const body = rejectionReason
      ? `Your EVC payment proof was not approved: ${rejectionReason}`
      : "Your EVC payment proof was not approved. Please check the details and submit again, or contact support.";

    const profile = await this.prisma.profile.findUnique({
      where: { userId: proof.userId },
    });
    const sourceKey = `evc_reject:${proof.id}`;
    try {
      const n = await this.prisma.notification.create({
        data: {
          convexId: `local_notif_${randomUUID()}`,
          userId: proof.userId,
          convexUserId: profile?.convexUserId ?? `local_${proof.userId}`,
          type: "payment",
          title: "Payment not approved",
          body,
          read: false,
          sourceKey,
          notificationCreatedAt: new Date(),
        },
      });
      this.realtime.emitToUser(proof.userId, "notification:new", {
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        read: n.read,
        createdAt: n.notificationCreatedAt.toISOString(),
      });
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? (err as { code?: string }).code
          : undefined;
      if (code !== "P2002") throw err;
    }

    await this.mail.queueEvcRejected(
      proof.userId,
      proof.id,
      rejectionReason ?? undefined
    );

    const actor = await this.prisma.user.findUniqueOrThrow({
      where: { id: actorUserId },
    });
    await this.prisma.auditLog.create({
      data: {
        convexId: `local_audit_${randomUUID()}`,
        actorUserId,
        convexActorUserId: actor.convexId,
        action: "evc_payment_rejected",
        targetUserId: proof.userId,
        targetProfileId: proof.profileId,
        loggedAt: new Date(),
        metadata: JSON.stringify({
          proofId: proof.id,
          reason: rejectionReason,
        }),
      },
    });

    return { ok: true as const };
  }

  private async requireStaff(userId: string) {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile || !isStaffRole(profile.role)) {
      throw new ForbiddenException("Admin required");
    }
  }
}
