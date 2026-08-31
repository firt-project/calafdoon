import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import {
  CurrentUser,
  Roles,
  type RequestUser,
} from "../auth/auth.guards";
import { CsrfGuard } from "../auth/csrf";
import { RateLimitGuard } from "../redis/rate-limit.guard";
import { AdminUsersService } from "./admin-users.service";

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues[0]?.message ?? "Invalid request body"
    );
  }
  return result.data;
}

@Controller("admin/users")
@Roles("admin")
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @UseGuards(RateLimitGuard)
  list(
    @CurrentUser() user: RequestUser,
    @Query("search") search?: string,
    @Query("role") role?: string,
    @Query("reviewStatus") reviewStatus?: string,
    @Query("hasPaid") hasPaid?: string,
    @Query("paymentTier") paymentTier?: string,
    @Query("gender") gender?: string,
    @Query("onTrial") onTrial?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
    @Query("country") country?: string,
    @Query("dateField") dateField?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("preset") preset?: string,
    @Query("timezone") timezone?: string,
    @Query("tz") tz?: string,
    @Query("eventType") eventType?: string,
    @Query("assignedReviewerId") assignedReviewerId?: string,
    @Query("waitingMoreThanHours") waitingMoreThanHours?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("sortBy") sortBy?: string,
    @Query("sortOrder") sortOrder?: string
  ) {
    const tier =
      paymentTier === "basic" || paymentTier === "premium"
        ? paymentTier
        : undefined;
    return this.users.listUsers({
      actorUserId: user.id,
      actorRole: user.role === "owner" ? "owner" : "admin",
      search,
      role,
      reviewStatus,
      hasPaid:
        tier !== undefined
          ? undefined
          : hasPaid === "true"
            ? true
            : hasPaid === "false"
              ? false
              : undefined,
      paymentTier: tier,
      gender:
        gender === "male" || gender === "female" ? gender : undefined,
      onTrial: onTrial === "true" ? true : undefined,
      cursor,
      limit: limit ? Number(limit) : undefined,
      country,
      dateField,
      dateFrom,
      dateTo,
      preset,
      timeZone: timezone || tz,
      eventType,
      assignedReviewerId,
      waitingMoreThanHours: waitingMoreThanHours
        ? Number(waitingMoreThanHours)
        : undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      sortBy,
      sortOrder: sortOrder === "asc" || sortOrder === "desc" ? sortOrder : undefined,
    });
  }

  @Post("bulk/approve")
  @UseGuards(CsrfGuard, RateLimitGuard)
  bulkApprove(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown
  ) {
    const parsed = parseBody(
      z.object({
        profileIds: z.array(z.string().uuid()).min(1).max(50),
        expectedUpdatedAtById: z.record(z.string()).optional(),
      }),
      body ?? {}
    );
    return this.users.bulkApprove(user.id, parsed.profileIds, {
      expectedUpdatedAtById: parsed.expectedUpdatedAtById,
    });
  }

  @Post("bulk/reject")
  @UseGuards(CsrfGuard, RateLimitGuard)
  bulkReject(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown
  ) {
    const parsed = parseBody(
      z.object({
        profileIds: z.array(z.string().uuid()).min(1).max(50),
        reason: z.string().min(1).max(2000),
        publicUserMessage: z.string().min(1).max(2000),
        internalAdminNote: z.string().max(4000).optional(),
        confirmCount: z.number().int().positive(),
        expectedUpdatedAtById: z.record(z.string()).optional(),
      }),
      body ?? {}
    );
    if (parsed.confirmCount !== parsed.profileIds.length) {
      throw new BadRequestException(
        "confirmCount must match the number of selected users"
      );
    }
    return this.users.bulkReject(user.id, parsed.profileIds, parsed);
  }

  @Get("lookup-email")
  @UseGuards(RateLimitGuard)
  lookupEmail(@Query("email") email?: string) {
    return this.users.lookupEmailIdentity(email ?? "");
  }

  /** Member emails only — Play Console tester list. Owner-only (bulk PII). */
  @Post("emails")
  @Roles("owner")
  @UseGuards(CsrfGuard, RateLimitGuard)
  exportEmails(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const parsed = parseBody(
      z.object({
        confirm: z.literal("EXPORT_MEMBER_EMAILS"),
      }),
      body ?? {}
    );
    return this.users.exportMemberEmails(user.id, parsed.confirm);
  }

  /** Preview / fix / delete accounts with typo domains like @gmail.come — owner only. */
  @Post("purge-typo-emails")
  @Roles("owner")
  @UseGuards(CsrfGuard, RateLimitGuard)
  purgeTypoEmails(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown
  ) {
    const parsed = parseBody(
      z.object({
        mode: z.enum(["dry-run", "fix", "delete"]),
        confirm: z.string().optional(),
      }),
      body ?? {}
    );
    return this.users.purgeTypoEmails(user.id, parsed);
  }

  @Post("release-orphan")
  @UseGuards(CsrfGuard, RateLimitGuard)
  releaseOrphan(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown
  ) {
    const parsed = parseBody(
      z.object({ userId: z.string().uuid() }),
      body ?? {}
    );
    return this.users.releaseOrphanEmail(user.id, parsed.userId);
  }

  @Get(":id")
  get(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.users.getUserDetail(
      id,
      user.id,
      user.role === "owner" ? "owner" : "admin"
    );
  }

  @Get(":id/activity")
  activity(@Param("id") id: string) {
    return this.users.getUserActivity(id);
  }

  @Post(":id/approve")
  @UseGuards(CsrfGuard, RateLimitGuard)
  approve(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const parsed = parseBody(
      z.object({
        expectedUpdatedAt: z.string().optional(),
      }),
      body ?? {}
    );
    return this.users.approveUser(user.id, id, parsed);
  }

  @Post(":id/reject")
  @UseGuards(CsrfGuard, RateLimitGuard)
  reject(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const parsed = parseBody(
      z.object({
        reason: z.string().max(2000).optional(),
        publicUserMessage: z.string().max(2000).optional(),
        internalAdminNote: z.string().max(4000).optional(),
        allowResubmission: z.boolean().optional(),
        requestPhoto: z.boolean().optional(),
        expectedUpdatedAt: z.string().optional(),
      }),
      body ?? {}
    );
    return this.users.rejectUser(user.id, id, parsed);
  }

  @Post(":id/request-changes")
  @UseGuards(CsrfGuard, RateLimitGuard)
  requestChanges(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const parsed = parseBody(
      z.object({
        whatMustChange: z.string().min(1).max(2000),
        publicInstructions: z.string().min(1).max(2000),
        internalAdminNote: z.string().max(4000).optional(),
        deadlineAt: z.string().optional().nullable(),
        requireNewPhoto: z.boolean().optional(),
        expectedUpdatedAt: z.string().optional(),
      }),
      body ?? {}
    );
    return this.users.requestChanges(user.id, id, parsed);
  }

  @Post(":id/assign-reviewer")
  @UseGuards(CsrfGuard, RateLimitGuard)
  assignReviewer(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const parsed = parseBody(
      z.object({
        action: z.enum(["assign_me", "reassign", "release"]),
        reviewerUserId: z.string().uuid().optional(),
        expectedUpdatedAt: z.string().optional(),
      }),
      body ?? {}
    );
    return this.users.assignReviewer(user.id, id, parsed);
  }

  @Post(":id/ban")
  @UseGuards(CsrfGuard, RateLimitGuard)
  ban(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const parsed = parseBody(
      z.object({
        reason: z.string().max(2000).optional(),
        internalAdminNote: z.string().max(4000).optional(),
      }),
      body ?? {}
    );
    return this.users.banUser(user.id, id, true, parsed);
  }

  @Post(":id/unban")
  @UseGuards(CsrfGuard, RateLimitGuard)
  unban(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const parsed = parseBody(
      z.object({
        reason: z.string().max(2000).optional(),
        internalAdminNote: z.string().max(4000).optional(),
      }),
      body ?? {}
    );
    return this.users.banUser(user.id, id, false, parsed);
  }

  /** L4: owner (higher rank) can clear staff MFA after device loss. Audited. */
  @Post(":id/reset-mfa")
  @UseGuards(CsrfGuard, RateLimitGuard)
  resetMfa(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Req() req: Request
  ) {
    return this.users.resetUserMfa(
      user.id,
      user.role === "owner" ? "owner" : "admin",
      id,
      req.ip
    );
  }

  @Post(":id/pause")
  @UseGuards(CsrfGuard, RateLimitGuard)
  pause(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const parsed = parseBody(
      z.object({
        reason: z.string().max(2000).optional(),
        publicUserMessage: z.string().max(2000).optional(),
      }),
      body ?? {}
    );
    return this.users.pauseUser(user.id, id, parsed);
  }

  @Post(":id/resume")
  @UseGuards(CsrfGuard, RateLimitGuard)
  resume(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const parsed = parseBody(
      z.object({ reason: z.string().max(2000).optional() }),
      body ?? {}
    );
    return this.users.resumeUser(user.id, id, parsed);
  }

  @Post(":id/suspend")
  @UseGuards(CsrfGuard, RateLimitGuard)
  suspend(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const parsed = parseBody(
      z.object({
        reason: z.string().max(2000).optional(),
        publicUserMessage: z.string().max(2000).optional(),
        suspensionExpiresAt: z.string().datetime().optional().nullable(),
      }),
      body ?? {}
    );
    return this.users.suspendUser(user.id, id, parsed);
  }

  @Post(":id/unsuspend")
  @UseGuards(CsrfGuard, RateLimitGuard)
  unsuspend(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const parsed = parseBody(
      z.object({ reason: z.string().max(2000).optional() }),
      body ?? {}
    );
    return this.users.unsuspendUser(user.id, id, parsed.reason);
  }

  @Get(":id/status-history")
  statusHistory(
    @Param("id") id: string,
    @Query("limit") limit?: string
  ) {
    return this.users.getStatusHistory(id, {
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post(":id/request-photo")
  @UseGuards(CsrfGuard, RateLimitGuard)
  requestPhoto(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const parsed = parseBody(
      z.object({ message: z.string().max(2000).optional() }),
      body ?? {}
    );
    return this.users.requestProfilePhoto(user.id, id, parsed.message);
  }

  @Patch(":id/advisor-reviewed")
  @UseGuards(CsrfGuard, RateLimitGuard)
  advisor(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const parsed = parseBody(
      z.object({ advisorReviewed: z.boolean() }),
      body
    );
    return this.users.setAdvisorReviewed(user.id, id, parsed.advisorReviewed);
  }

  @Patch(":id/role")
  @Roles("owner")
  @UseGuards(CsrfGuard, RateLimitGuard)
  setRole(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const parsed = parseBody(
      z.object({ role: z.enum(["user", "admin"]) }),
      body
    );
    return this.users.setUserRole(user.id, id, parsed.role);
  }

  @Delete(":id")
  @UseGuards(CsrfGuard, RateLimitGuard)
  remove(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Query("dryRun") dryRun?: string,
    @Headers("x-correlation-id") correlationId?: string,
    @Headers("x-request-id") requestId?: string
  ) {
    return this.users.deleteUser(user.id, id, {
      dryRun: dryRun === "true" || dryRun === "1",
      correlationId,
      requestId,
    });
  }
}
