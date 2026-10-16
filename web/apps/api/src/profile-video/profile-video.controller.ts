import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
  type RawBodyRequest,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import {
  CurrentUser,
  Public,
  RequireProfile,
  Roles,
  type RequestUser,
} from "../auth/auth.guards";
import { CsrfGuard } from "../auth/csrf";
import { RateLimitGuard } from "../redis/rate-limit.guard";
import { AuditLogService } from "../admin/audit-log.service";
import { AppOnlyGuard } from "./app-only.guard";
import { BunnyStreamClient } from "./bunny-stream.client";
import { ProfileVideoService } from "./profile-video.service";

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(result.error.issues[0]?.message ?? "Invalid request body");
  }
  return result.data;
}

/** Member-facing profile video API. All routes require a signed-in member. */
@Controller("profile-video")
@UseGuards(AppOnlyGuard, CsrfGuard, RateLimitGuard)
@RequireProfile()
export class ProfileVideoController {
  constructor(private readonly videos: ProfileVideoService) {}

  /** Create (or resume) a pending video and return short-lived direct-upload credentials. */
  @Post("upload-auth")
  @HttpCode(200)
  uploadAuth(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const parsed = parseBody(
      z.object({
        contentType: z.string().min(3).max(60),
        sizeBytes: z.number().int().positive(),
        durationSec: z.number().positive().max(600).optional(),
      }),
      body
    );
    return this.videos.requestUpload(user.id, parsed);
  }

  /** The app finished sending bytes. */
  @Post("confirm")
  @HttpCode(200)
  confirm(@CurrentUser() user: RequestUser) {
    return this.videos.confirmUpload(user.id);
  }

  @Get("status")
  status(@CurrentUser() user: RequestUser) {
    return this.videos.getMyStatus(user.id);
  }

  /** Self-check shown in the app when playback fails (no secrets in the result). */
  @Get("diagnose")
  diagnose(@CurrentUser() user: RequestUser) {
    return this.videos.diagnose(user.id);
  }

  /** Delete the signed-in member's own profile video (active and pending). */
  @Delete()
  @HttpCode(200)
  async remove(@CurrentUser() user: RequestUser) {
    await this.videos.removeAllForUser(user.id);
    return { ok: true as const };
  }

  /** Playback authorization for a profile the viewer is allowed to see. */
  @Get(":userId/playback")
  playback(
    @CurrentUser() user: RequestUser,
    @Param("userId", new ParseUUIDPipe()) ownerUserId: string
  ) {
    return this.videos.getPlayback(user.id, ownerUserId);
  }
}

/** Bunny Stream webhook — authenticated by HMAC signature, never by session. */
@Controller("webhooks/bunny-stream")
export class BunnyStreamWebhookController {
  constructor(
    private readonly videos: ProfileVideoService,
    private readonly bunny: BunnyStreamClient
  ) {}

  @Public()
  @Post()
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers("x-bunnystream-signature") signature?: string,
    @Headers("x-bunnystream-signature-version") version?: string,
    @Headers("x-bunnystream-signature-algorithm") algorithm?: string
  ) {
    if (!this.bunny.configured || !this.bunny.webhookConfigured) {
      throw new ServiceUnavailableException("Webhook is not configured.");
    }
    const raw =
      req.rawBody ??
      (typeof req.body === "string" || Buffer.isBuffer(req.body) ? req.body : undefined);
    if (!raw || !this.bunny.verifyWebhook({ rawBody: raw, signature, version, algorithm })) {
      throw new UnauthorizedException("Invalid signature");
    }
    let payload: { VideoLibraryId?: unknown; VideoGuid?: unknown };
    try {
      payload = JSON.parse(Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw));
    } catch {
      throw new BadRequestException("Invalid payload");
    }
    // Always 200 once authenticated so Bunny does not retry events we ignore.
    return this.videos.handleWebhook({
      videoLibraryId: payload.VideoLibraryId,
      videoGuid: payload.VideoGuid,
    });
  }
}

/** Staff moderation of profile videos. */
@Controller("admin/profile-video")
@Roles("admin")
export class AdminProfileVideoController {
  constructor(
    private readonly videos: ProfileVideoService,
    private readonly audit: AuditLogService
  ) {}

  @Get(":userId/playback")
  @UseGuards(RateLimitGuard)
  playback(
    @CurrentUser() user: RequestUser,
    @Param("userId", new ParseUUIDPipe()) ownerUserId: string
  ) {
    return this.videos.getPlayback(user.id, ownerUserId);
  }

  @Get(":userId")
  @UseGuards(RateLimitGuard)
  async has(@Param("userId", new ParseUUIDPipe()) userId: string) {
    return this.videos.getMyStatus(userId);
  }

  @Delete(":userId")
  @HttpCode(200)
  @UseGuards(CsrfGuard, RateLimitGuard)
  async remove(
    @CurrentUser() user: RequestUser,
    @Param("userId", new ParseUUIDPipe()) userId: string
  ) {
    const removed = await this.videos.removeAllForUser(userId);
    await this.audit.write({
      actorUserId: user.id,
      action: "remove_profile_video",
      targetUserId: userId,
      metadata: { removed: removed.length },
    });
    return { ok: true as const, removed: removed.length };
  }
}
