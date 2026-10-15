import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import {
  CurrentUser,
  RequireProfile,
  Roles,
  type RequestUser,
} from "../auth/auth.guards";
import { CsrfGuard } from "../auth/csrf";
import { RateLimitGuard } from "../redis/rate-limit.guard";
import { VerificationService } from "./verification.service";

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues[0]?.message ?? "Invalid request body"
    );
  }
  return result.data;
}

@Controller("verification")
@UseGuards(CsrfGuard, RateLimitGuard)
@RequireProfile()
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Get("status")
  status(@CurrentUser() user: RequestUser) {
    return this.verification.status(user.id);
  }

  @Post("sign-upload")
  @HttpCode(200)
  signUpload(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const parsed = parseBody(
      z.object({
        contentType: z.string().min(3).max(100),
        sizeBytes: z.number().int().positive().optional(),
      }),
      body
    );
    return this.verification.signUpload(user.id, parsed);
  }

  @Post("submit")
  @HttpCode(200)
  submit(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const parsed = parseBody(
      z.object({ mediaId: z.string().uuid(), prompt: z.string().min(1).max(120) }),
      body
    );
    return this.verification.submit(user.id, parsed.mediaId, parsed.prompt);
  }
}

@Controller("admin/verifications")
@Roles("admin")
export class AdminVerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Get()
  @UseGuards(RateLimitGuard)
  list(@CurrentUser() user: RequestUser, @Query("status") status?: string) {
    const s =
      status === "approved" || status === "rejected" ? status : "pending";
    return this.verification.listForReview(
      user.id,
      user.role === "owner" ? "owner" : "admin",
      s
    );
  }

  @Get("count")
  @UseGuards(RateLimitGuard)
  count() {
    return this.verification.pendingCount();
  }

  @Post(":id/approve")
  @HttpCode(200)
  @UseGuards(CsrfGuard, RateLimitGuard)
  approve(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.verification.approve(user.id, id);
  }

  @Post(":id/reject")
  @HttpCode(200)
  @UseGuards(CsrfGuard, RateLimitGuard)
  reject(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const parsed = parseBody(
      z.object({ reason: z.string().min(3).max(300) }),
      body
    );
    return this.verification.reject(user.id, id, parsed.reason);
  }
}
