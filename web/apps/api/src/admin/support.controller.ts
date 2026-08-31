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
  Public,
  RequireProfile,
  Roles,
  type RequestUser,
} from "../auth/auth.guards";
import { CsrfGuard } from "../auth/csrf";
import { RateLimitGuard } from "../redis/rate-limit.guard";
import { SupportService } from "./support.service";

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
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get("admin/support")
  @Roles("admin")
  @UseGuards(RateLimitGuard)
  listAdmin(
    @Query("status") status?: "open" | "reviewed" | "closed",
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string
  ) {
    return this.support.listAdmin({
      status,
      cursor,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get("admin/support/:contactId")
  @Roles("admin")
  getAdmin(@Param("contactId") contactId: string) {
    return this.support.getAdmin(contactId);
  }

  @Post("admin/support/:contactId/reply")
  @Roles("admin")
  @UseGuards(CsrfGuard, RateLimitGuard)
  replyAdmin(
    @CurrentUser() user: RequestUser,
    @Param("contactId") contactId: string,
    @Body() body: unknown
  ) {
    const parsed = parseBody(z.object({ message: z.string().min(2).max(2000) }), body);
    return this.support.replyAsAdmin(user.id, contactId, parsed.message);
  }

  @Post("admin/support/:contactId/status")
  @Roles("admin")
  @UseGuards(CsrfGuard, RateLimitGuard)
  statusAdmin(
    @CurrentUser() user: RequestUser,
    @Param("contactId") contactId: string,
    @Body() body: unknown
  ) {
    const parsed = parseBody(
      z.object({ status: z.enum(["open", "reviewed", "closed"]) }),
      body
    );
    return this.support.updateStatus(user.id, contactId, parsed.status);
  }

  @Get("support/me")
  @RequireProfile()
  listMine(@CurrentUser() user: RequestUser) {
    return this.support.listMine(user.id);
  }

  @Get("support/me/:contactId")
  @RequireProfile()
  getMine(@CurrentUser() user: RequestUser, @Param("contactId") contactId: string) {
    return this.support.getMine(user.id, contactId);
  }

  @Post("support/public")
  @Public()
  @UseGuards(RateLimitGuard)
  createPublic(@Body() body: unknown) {
    const parsed = parseBody(
      z.object({
        name: z.string().min(2).max(120),
        email: z.string().email().max(200),
        subject: z.string().min(3).max(200),
        message: z.string().min(10).max(2000),
        companyWebsite: z.string().max(500).optional(),
      }),
      body
    );
    return this.support.sendPublicContact(parsed);
  }

  @Post("support")
  @RequireProfile()
  @UseGuards(CsrfGuard, RateLimitGuard)
  create(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const parsed = parseBody(
      z.object({
        topic: z.enum(["photo_upload", "account", "payment", "other"]),
        message: z.string().min(10).max(2000),
        source: z.enum(["profile", "questionnaire", "contact_page", "other"]),
      }),
      body
    );
    return this.support.sendSupportMessage(user.id, parsed);
  }

  @Post("support/:contactId/message")
  @RequireProfile()
  @UseGuards(CsrfGuard, RateLimitGuard)
  replyMember(
    @CurrentUser() user: RequestUser,
    @Param("contactId") contactId: string,
    @Body() body: unknown
  ) {
    const parsed = parseBody(z.object({ message: z.string().min(2).max(2000) }), body);
    return this.support.replyAsMember(user.id, contactId, parsed.message);
  }
}
