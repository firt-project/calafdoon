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
  type RequestUser,
} from "../auth/auth.guards";
import { CsrfGuard } from "../auth/csrf";
import { RateLimitGuard } from "../redis/rate-limit.guard";
import { NotificationsService } from "./notifications.service";

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
@UseGuards(CsrfGuard, RateLimitGuard)
@RequireProfile()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get("notifications")
  async list(
    @CurrentUser() user: RequestUser,
    @Query("cursor") cursor?: string,
    @Query("limit") limitRaw?: string
  ) {
    const limit = limitRaw ? Number(limitRaw) : undefined;
    return this.notifications.list(user.id, {
      cursor,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
  }

  @Get("notifications/unread-count")
  async unreadCount(@CurrentUser() user: RequestUser) {
    const count = await this.notifications.unreadCount(user.id);
    return { count };
  }

  /** Alias — Convex header badge uses notification unread. */
  @Get("me/unread-count")
  async meUnread(@CurrentUser() user: RequestUser) {
    const count = await this.notifications.unreadCount(user.id);
    return { count };
  }

  @Post("notifications/:id/read")
  @HttpCode(200)
  async markOne(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.notifications.markOneRead(user.id, id);
  }

  @Post("notifications/read-all")
  @HttpCode(200)
  async markAll(@CurrentUser() user: RequestUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Post("notifications/read")
  @HttpCode(200)
  async markFiltered(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown
  ) {
    const parsed = parseBody(
      z.object({
        types: z
          .array(
            z.enum([
              "like",
              "match",
              "message",
              "announcement",
              "approval",
              "payment",
            ])
          )
          .optional(),
        relatedUserId: z.string().uuid().optional(),
      }),
      body
    );
    return this.notifications.markByFilter(user.id, parsed);
  }
}
