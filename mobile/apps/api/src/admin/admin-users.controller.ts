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
  UseGuards,
} from "@nestjs/common";
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
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string
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
      cursor,
      limit: limit ? Number(limit) : undefined,
    });
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
  approve(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.users.approveUser(user.id, id);
  }

  @Post(":id/reject")
  @UseGuards(CsrfGuard, RateLimitGuard)
  reject(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const parsed = parseBody(
      z.object({ reason: z.string().max(2000).optional() }),
      body ?? {}
    );
    return this.users.rejectUser(user.id, id, parsed.reason);
  }

  @Post(":id/ban")
  @UseGuards(CsrfGuard, RateLimitGuard)
  ban(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.users.banUser(user.id, id, true);
  }

  @Post(":id/unban")
  @UseGuards(CsrfGuard, RateLimitGuard)
  unban(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.users.banUser(user.id, id, false);
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
