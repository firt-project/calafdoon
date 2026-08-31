import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
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
import { AnnouncementsService } from "./announcements.service";

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues[0]?.message ?? "Invalid request body"
    );
  }
  return result.data;
}

@Controller("admin/announcements")
@Roles("admin")
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  @UseGuards(RateLimitGuard)
  list(@Query("cursor") cursor?: string, @Query("limit") limit?: string) {
    return this.announcements.list({
      cursor,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post()
  @UseGuards(CsrfGuard, RateLimitGuard)
  create(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const parsed = parseBody(
      z.object({
        title: z.string().min(1).max(120),
        body: z.string().min(1).max(4000),
        audience: z.enum(["all", "paid", "trial", "unpaid"]).optional(),
        scheduledFor: z.number().int().positive().optional(),
      }),
      body
    );
    return this.announcements.create(user.id, {
      title: parsed.title,
      body: parsed.body,
      audience: parsed.audience,
      scheduledFor: parsed.scheduledFor,
    });
  }

  @Post(":id/send")
  @UseGuards(CsrfGuard, RateLimitGuard)
  send(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.announcements.sendNow(user.id, id);
  }

  @Post(":id/schedule")
  @UseGuards(CsrfGuard, RateLimitGuard)
  schedule(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const parsed = parseBody(
      z.object({ scheduledFor: z.number().int().positive() }),
      body
    );
    return this.announcements.schedule(user.id, id, parsed.scheduledFor);
  }
}
