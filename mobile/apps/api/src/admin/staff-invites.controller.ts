import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import {
  CurrentUser,
  Public,
  Roles,
  type RequestUser,
} from "../auth/auth.guards";
import { CsrfGuard } from "../auth/csrf";
import { RateLimitGuard } from "../redis/rate-limit.guard";
import { StaffInvitesService } from "./staff-invites.service";

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
export class StaffInvitesController {
  constructor(private readonly invites: StaffInvitesService) {}

  @Get("admin/staff-invites")
  @Roles("owner")
  list() {
    return this.invites.list();
  }

  @Post("admin/staff-invites")
  @Roles("owner")
  @UseGuards(CsrfGuard, RateLimitGuard)
  create(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const parsed = parseBody(z.object({ email: z.string().email() }), body);
    return this.invites.create(user.id, parsed.email);
  }

  @Post("admin/staff-invites/:id/revoke")
  @Roles("owner")
  @UseGuards(CsrfGuard, RateLimitGuard)
  revoke(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.invites.revoke(user.id, id);
  }

  @Public()
  @Get("staff-invites/:token")
  getByToken(@Param("token") token: string) {
    return this.invites.getByToken(token);
  }

  @Post("staff-invites/:token/accept")
  @UseGuards(CsrfGuard, RateLimitGuard)
  accept(@CurrentUser() user: RequestUser, @Param("token") token: string) {
    return this.invites.accept(user.id, token);
  }
}
