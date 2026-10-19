import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { CurrentUser, Public, RequireProfile, type RequestUser } from "../auth/auth.guards";
import { CsrfGuard } from "../auth/csrf";
import { RateLimitGuard } from "../redis/rate-limit.guard";
import { ChaperoneService, RELATIONSHIPS } from "./chaperone.service";

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(result.error.issues[0]?.message ?? "Invalid request body");
  }
  return result.data;
}

@Controller("conversations/:id/chaperones")
@UseGuards(CsrfGuard, RateLimitGuard)
@RequireProfile()
export class ChaperoneController {
  constructor(private readonly chaperones: ChaperoneService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.chaperones.list(user.id, id);
  }

  @Post()
  @HttpCode(200)
  invite(
    @CurrentUser() user: RequestUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: unknown
  ) {
    const parsed = parseBody(
      z.object({
        guardianName: z.string().min(2).max(60),
        relationship: z.enum(RELATIONSHIPS),
      }),
      body
    );
    return this.chaperones.invite(user.id, id, parsed);
  }

  @Post(":chaperoneId/respond")
  @HttpCode(200)
  respond(
    @CurrentUser() user: RequestUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("chaperoneId", new ParseUUIDPipe()) chaperoneId: string,
    @Body() body: unknown
  ) {
    const parsed = parseBody(z.object({ accept: z.boolean() }), body);
    return this.chaperones.respond(user.id, id, chaperoneId, parsed.accept);
  }

  @Delete(":chaperoneId")
  @HttpCode(200)
  revoke(
    @CurrentUser() user: RequestUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("chaperoneId", new ParseUUIDPipe()) chaperoneId: string
  ) {
    return this.chaperones.revoke(user.id, id, chaperoneId);
  }
}

/** Read-only page data for a guardian. No account: the signed link is the credential. */
@Controller("guardian")
export class GuardianViewController {
  constructor(private readonly chaperones: ChaperoneService) {}

  @Public()
  @Get(":token")
  @UseGuards(RateLimitGuard)
  view(@Param("token") token: string) {
    return this.chaperones.guardianView(token);
  }
}
