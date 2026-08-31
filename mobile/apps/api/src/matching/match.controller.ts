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
  RequirePaid,
  RequireProfile,
  type RequestUser,
} from "../auth/auth.guards";
import { CsrfGuard } from "../auth/csrf";
import { RateLimitGuard } from "../redis/rate-limit.guard";
import { MatchService } from "./match.service";
import type { MatchFilterArgs } from "./filters";

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues[0]?.message ?? "Invalid request body"
    );
  }
  return result.data;
}

const filtersSchema = z.object({
  country: z.string().optional(),
  city: z.string().optional(),
  minAge: z.coerce.number().optional(),
  maxAge: z.coerce.number().optional(),
  minHeight: z.coerce.number().optional(),
  maxHeight: z.coerce.number().optional(),
  religiousLevel: z.string().optional(),
  education: z.string().optional(),
  occupation: z.string().optional(),
  children: z.coerce.number().optional(),
  maritalStatus: z.string().optional(),
  marriageTimeline: z.string().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const actionSchema = z.object({
  action: z.enum(["like", "pass", "shortlist"]),
});

const startChatSchema = z.object({
  targetUserId: z.string().uuid(),
});

const archiveSchema = z.object({
  archived: z.boolean(),
});

@Controller("matches")
@UseGuards(CsrfGuard, RateLimitGuard)
@RequireProfile()
@RequirePaid()
export class MatchController {
  constructor(private readonly matches: MatchService) {}

  @Get("discover")
  async discover(
    @CurrentUser() user: RequestUser,
    @Query() query: Record<string, string>
  ) {
    const parsed = filtersSchema.parse(query);
    const { cursor, limit, ...filters } = parsed;
    return this.matches.discover(user.id, filters as MatchFilterArgs, {
      cursor,
      limit,
    });
  }

  /** Personalized social-style home feed (daily match + liked-you + mutuals). */
  @Get("home-feed")
  async homeFeed(@CurrentUser() user: RequestUser) {
    return this.matches.homeFeed(user.id);
  }

  @Get("lists")
  async lists(
    @CurrentUser() user: RequestUser,
    @Query() query: Record<string, string>
  ) {
    const parsed = filtersSchema.parse(query);
    const { cursor: _c, limit: _l, ...filters } = parsed;
    return this.matches.lists(user.id, filters as MatchFilterArgs);
  }

  @Get("mutual")
  async mutual(
    @CurrentUser() user: RequestUser,
    @Query("list") list?: string
  ) {
    const allowed =
      list === "new" || list === "archived" || list === "active"
        ? list
        : "active";
    return this.matches.mutual(user.id, allowed);
  }

  /**
   * Open chat without requiring a reciprocal like.
   * Declared before :userId routes so "start-chat" is not captured as an id.
   */
  @Post("start-chat")
  @HttpCode(200)
  async startChat(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const parsed = parseBody(startChatSchema, body);
    return this.matches.startChat(user.id, parsed.targetUserId);
  }

  @Get(":userId/breakdown")
  async breakdown(
    @CurrentUser() user: RequestUser,
    @Param("userId") targetUserId: string
  ) {
    return this.matches.breakdown(user.id, targetUserId);
  }

  /** Full dating card for a match/discover peer (no email/phone). */
  @Get(":userId/card")
  async peerCard(
    @CurrentUser() user: RequestUser,
    @Param("userId") targetUserId: string
  ) {
    return this.matches.getPeerCard(user.id, targetUserId);
  }

  @Post(":userId/action")
  @HttpCode(200)
  async action(
    @CurrentUser() user: RequestUser,
    @Param("userId") targetUserId: string,
    @Body() body: unknown
  ) {
    const parsed = parseBody(actionSchema, body);
    return this.matches.act(user.id, targetUserId, parsed.action);
  }

  @Post(":matchId/seen")
  @HttpCode(200)
  async seen(
    @CurrentUser() user: RequestUser,
    @Param("matchId") matchId: string
  ) {
    return this.matches.markSeen(user.id, matchId);
  }

  @Post(":matchId/archive")
  @HttpCode(200)
  async archive(
    @CurrentUser() user: RequestUser,
    @Param("matchId") matchId: string,
    @Body() body: unknown
  ) {
    const parsed = parseBody(archiveSchema, body);
    return this.matches.archive(user.id, matchId, parsed.archived);
  }

  @Get(":matchId/wali")
  async wali(
    @CurrentUser() user: RequestUser,
    @Param("matchId") matchId: string
  ) {
    return this.matches.getWali(user.id, matchId);
  }

  @Get(":matchId/private-reveal")
  async privateRevealStatus(
    @CurrentUser() user: RequestUser,
    @Param("matchId") matchId: string
  ) {
    return this.matches.getPrivateRevealStatus(user.id, matchId);
  }

  @Post(":matchId/private-reveal")
  @HttpCode(200)
  async privateReveal(
    @CurrentUser() user: RequestUser,
    @Param("matchId") matchId: string,
    @Body() body: unknown
  ) {
    const parsed = z
      .object({ mediaId: z.string().uuid().optional() })
      .safeParse(body ?? {});
    return this.matches.revealPrivatePhoto(
      user.id,
      matchId,
      parsed.success ? parsed.data.mediaId : undefined
    );
  }
}
