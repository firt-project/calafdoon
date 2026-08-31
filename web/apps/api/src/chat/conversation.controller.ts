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
import { ConversationService } from "./conversation.service";

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues[0]?.message ?? "Invalid request body"
    );
  }
  return result.data;
}

@Controller("conversations")
@UseGuards(CsrfGuard, RateLimitGuard)
@RequireProfile()
export class ConversationController {
  constructor(private readonly conversations: ConversationService) {}

  @Get()
  async list(
    @CurrentUser() user: RequestUser,
    @Query("list") list?: string
  ) {
    const allowed = ["active", "new", "archived"] as const;
    const value = allowed.includes(list as (typeof allowed)[number])
      ? (list as (typeof allowed)[number])
      : "active";
    return this.conversations.listConversations(user.id, value);
  }

  @Get(":id")
  async getOne(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.conversations.getConversation(user.id, id);
  }

  @Get(":id/partner")
  async partner(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.conversations.getPartnerProfile(user.id, id);
  }

  @Get(":id/messages")
  async messages(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limitRaw?: string
  ) {
    const limit = limitRaw ? Number(limitRaw) : undefined;
    return this.conversations.listMessages(user.id, id, {
      cursor,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
  }

  @Post(":id/images/sign-upload")
  @HttpCode(200)
  async signImageUpload(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const parsed = parseBody(
      z.object({
        contentType: z.string().min(3).max(100),
        sizeBytes: z.number().int().positive(),
      }),
      body
    );
    return this.conversations.signImageUpload(user.id, id, parsed);
  }

  @Post(":id/messages")
  @HttpCode(200)
  async send(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const parsed = parseBody(
      z.object({
        message: z.string().optional(),
        imageMediaId: z.string().uuid().optional(),
        idempotencyKey: z.string().min(8).max(128).optional(),
      }),
      body
    );
    return this.conversations.sendMessage(user.id, id, parsed);
  }

  @Post(":id/read")
  @HttpCode(200)
  async read(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.conversations.markRead(user.id, id);
  }

  @Post(":id/typing")
  @HttpCode(200)
  async typing(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const parsed = parseBody(
      z.object({ isTyping: z.boolean() }),
      body
    );
    return this.conversations.setTyping(user.id, id, parsed.isTyping);
  }

  @Get(":id/typing")
  async getTyping(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.conversations.getTyping(user.id, id);
  }

  @Get(":conversationId/messages/:messageId/image-url")
  async imageUrl(
    @CurrentUser() user: RequestUser,
    @Param("conversationId") conversationId: string,
    @Param("messageId") messageId: string
  ) {
    return this.conversations.getMessageImageUrl(
      user.id,
      conversationId,
      messageId
    );
  }
}
