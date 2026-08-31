import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { z } from "zod";
import {
  AllowDuringPasswordReset,
  AllowWhileMfaEnrollment,
  AllowWhileUnverified,
  CurrentUser,
  RequireProfile,
  type RequestUser,
} from "../auth/auth.guards";
import { CsrfGuard, clearAuthCookies } from "../auth/csrf";
import { RateLimitGuard } from "../redis/rate-limit.guard";
import { ProfileService } from "./profile.service";
import { ProfilePhotosService } from "./photos.service";
import { GeolocationService } from "./geolocation.service";

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues[0]?.message ?? "Invalid request body"
    );
  }
  return result.data;
}

const genderSchema = z.object({
  gender: z.enum(["male", "female"]),
});

const questionnaireSchema = z.object({
  step: z.number().int().min(0).max(20),
  data: z.record(z.unknown()),
});

const editsSchema = z.object({
  data: z.record(z.unknown()),
});

const patchSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime().optional(),
  })
  .passthrough();

const waliSchema = z.object({
  waliName: z.string().max(200).optional(),
  waliPhone: z.string().max(40).optional(),
});

const signUploadSchema = z.object({
  contentType: z.string().min(3).max(100),
  slot: z.enum(["main", "additional", "private"]).default("additional"),
  sizeBytes: z.number().int().positive(),
});

const confirmUploadSchema = z.object({
  mediaId: z.string().uuid(),
  setAsMain: z.boolean().optional(),
});

const reorderSchema = z.object({
  orderedMediaIds: z.array(z.string().uuid()).min(1).max(5),
});

const geolocationVerifySchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative().optional(),
});

const deleteAccountSchema = z.object({
  password: z.string().min(1).max(256),
});

@Controller("profile")
@UseGuards(CsrfGuard)
export class ProfileController {
  constructor(
    private readonly profiles: ProfileService,
    private readonly photos: ProfilePhotosService,
    private readonly geolocation: GeolocationService,
    private readonly config: ConfigService
  ) {}

  private cookieOpts() {
    const secure =
      this.config.get<string>("COOKIE_SECURE") === "true" ||
      this.config.get<string>("NODE_ENV") === "production";
    const domain = this.config.get<string>("COOKIE_DOMAIN") || undefined;
    return { secure, domain };
  }

  @Get("me")
  async me(@CurrentUser() user: RequestUser) {
    if (!user.hasProfile) {
      return { profile: null };
    }
    return { profile: await this.profiles.getMe(user.id) };
  }

  @Get("access-state")
  async accessState(@CurrentUser() user: RequestUser) {
    return this.profiles.getAccessState(user.id);
  }

  @Post("ensure")
  @HttpCode(200)
  async ensure(@CurrentUser() user: RequestUser) {
    return { profile: await this.profiles.ensure(user.id) };
  }

  @Patch("me")
  @RequireProfile()
  async patchMe(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown
  ) {
    const parsed = parseBody(patchSchema, body);
    const { expectedUpdatedAt, ...rest } = parsed;
    return {
      profile: await this.profiles.patchMe(user.id, rest, {
        expectedUpdatedAt,
      }),
    };
  }

  @Post("complete-registration-gender")
  @HttpCode(200)
  @RequireProfile()
  async completeGender(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown
  ) {
    const parsed = parseBody(genderSchema, body);
    return {
      profile: await this.profiles.completeRegistrationGender(
        user.id,
        parsed.gender
      ),
    };
  }

  @Post("complete-questionnaire")
  @HttpCode(200)
  @RequireProfile()
  async completeQuestionnaire(@CurrentUser() user: RequestUser) {
    return {
      profile: await this.profiles.completeQuestionnaire(user.id),
    };
  }

  @Post("questionnaire/autosave")
  @HttpCode(200)
  @RequireProfile()
  async autosave(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown
  ) {
    const parsed = parseBody(questionnaireSchema, body);
    return {
      profile: await this.profiles.autosaveQuestionnaire(
        user.id,
        parsed.step,
        parsed.data
      ),
    };
  }

  @Post("questionnaire/update")
  @HttpCode(200)
  @RequireProfile()
  async updateQuestionnaire(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown
  ) {
    const parsed = parseBody(questionnaireSchema, body);
    return {
      profile: await this.profiles.updateQuestionnaire(
        user.id,
        parsed.step,
        parsed.data
      ),
    };
  }

  @Post("questionnaire/save-edits")
  @HttpCode(200)
  @RequireProfile()
  async saveEdits(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown
  ) {
    const parsed = parseBody(editsSchema, body);
    return {
      profile: await this.profiles.saveProfileEdits(user.id, parsed.data),
    };
  }

  @Post("geolocation/verify")
  @HttpCode(200)
  @RequireProfile()
  async verifyGeolocation(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown
  ) {
    const parsed = parseBody(geolocationVerifySchema, body);
    return this.geolocation.verifyAndSaveLocation(user.id, parsed);
  }

  @Get("wali")
  @RequireProfile()
  async getWali(@CurrentUser() user: RequestUser) {
    return this.profiles.getWali(user.id);
  }

  @Patch("wali")
  @RequireProfile()
  async patchWali(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown
  ) {
    const parsed = parseBody(waliSchema, body);
    return this.profiles.updateWali(user.id, parsed);
  }

  @Get("me/photos")
  @RequireProfile()
  async myPhotos(@CurrentUser() user: RequestUser) {
    return this.photos.listMine(user.id);
  }

  @Post("photos/sign-upload")
  @HttpCode(200)
  @RequireProfile()
  @UseGuards(RateLimitGuard)
  async signUpload(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown
  ) {
    const parsed = parseBody(signUploadSchema, body);
    return this.photos.signUpload(user.id, {
      contentType: parsed.contentType,
      slot: parsed.slot ?? "additional",
      sizeBytes: parsed.sizeBytes,
    });
  }

  @Post("photos/confirm-upload")
  @HttpCode(200)
  @RequireProfile()
  @UseGuards(RateLimitGuard)
  async confirmUpload(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown
  ) {
    const parsed = parseBody(confirmUploadSchema, body);
    return this.photos.confirmUpload(user.id, parsed);
  }

  @Delete("photos/:id")
  @RequireProfile()
  async deletePhoto(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string
  ) {
    return this.photos.deletePhoto(user.id, id);
  }

  @Delete("account")
  @HttpCode(200)
  @AllowDuringPasswordReset()
  @AllowWhileUnverified()
  @AllowWhileMfaEnrollment()
  @UseGuards(RateLimitGuard)
  async deleteAccount(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const parsed = parseBody(deleteAccountSchema, body);
    await this.profiles.deleteMyAccount(user.id, parsed.password, req.ip);
    clearAuthCookies(res, this.cookieOpts());
    return { ok: true };
  }

  @Patch("photos/order")
  @RequireProfile()
  async reorder(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown
  ) {
    const parsed = parseBody(reorderSchema, body);
    return this.photos.reorder(user.id, parsed.orderedMediaIds);
  }

  @Get(":id/photo-access/:mediaId")
  async photoAccessMedia(
    @CurrentUser() user: RequestUser,
    @Param("id") profileId: string,
    @Param("mediaId") mediaId: string
  ) {
    return this.photos.photoAccess(user.id, profileId, mediaId);
  }
}
