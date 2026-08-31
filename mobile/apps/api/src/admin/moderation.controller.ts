import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
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
import { ModerationService, REPORT_REASONS } from "./moderation.service";

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues[0]?.message ?? "Invalid request body"
    );
  }
  return result.data;
}

@Controller()
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Get("admin/reports")
  @Roles("admin")
  @UseGuards(RateLimitGuard)
  listReports(
    @Query("status") status?: "open" | "reviewed" | "dismissed",
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string
  ) {
    return this.moderation.listReports({
      status,
      cursor,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get("admin/reports/:id")
  @Roles("admin")
  getReport(@Param("id") id: string) {
    return this.moderation.getReport(id);
  }

  @Post("admin/reports/:id/resolve")
  @Roles("admin")
  @UseGuards(CsrfGuard, RateLimitGuard)
  resolve(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const parsed = parseBody(
      z.object({
        priority: z.enum(["low", "medium", "high"]).optional(),
        adminNotes: z.string().max(2000).optional(),
        resolution: z.string().max(1000).optional(),
      }),
      body ?? {}
    );
    return this.moderation.updateReportStatus(user.id, id, {
      status: "reviewed",
      ...parsed,
    });
  }

  @Post("admin/reports/:id/dismiss")
  @Roles("admin")
  @UseGuards(CsrfGuard, RateLimitGuard)
  dismiss(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const parsed = parseBody(
      z.object({
        priority: z.enum(["low", "medium", "high"]).optional(),
        adminNotes: z.string().max(2000).optional(),
        resolution: z.string().max(1000).optional(),
      }),
      body ?? {}
    );
    return this.moderation.updateReportStatus(user.id, id, {
      status: "dismissed",
      ...parsed,
    });
  }

  @Post("moderation/block")
  @RequireProfile()
  @UseGuards(CsrfGuard, RateLimitGuard)
  block(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const parsed = parseBody(
      z.object({ userId: z.string().uuid() }),
      body
    );
    return this.moderation.blockUser(user.id, parsed.userId);
  }

  @Delete("moderation/block/:userId")
  @RequireProfile()
  @UseGuards(CsrfGuard, RateLimitGuard)
  unblock(@CurrentUser() user: RequestUser, @Param("userId") userId: string) {
    return this.moderation.unblockUser(user.id, userId);
  }

  @Post("moderation/report")
  @RequireProfile()
  @UseGuards(CsrfGuard, RateLimitGuard)
  report(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const parsed = parseBody(
      z.object({
        userId: z.string().uuid(),
        reason: z.enum(REPORT_REASONS as unknown as [string, ...string[]]),
        details: z.string().max(500).optional(),
        alsoBlock: z.boolean().optional(),
      }),
      body
    );
    return this.moderation.reportUser(user.id, {
      reportedUserId: parsed.userId,
      reason: parsed.reason,
      details: parsed.details,
      alsoBlock: parsed.alsoBlock,
    });
  }

  @Get("moderation/blocks")
  @RequireProfile()
  blocks(@CurrentUser() user: RequestUser) {
    return this.moderation.listMyBlocks(user.id);
  }
}
