import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { CurrentUser, type RequestUser } from "../auth/auth.guards";
import { CsrfGuard } from "../auth/csrf";
import { RateLimitGuard } from "../redis/rate-limit.guard";
import { PushService } from "./push.service";

const bodySchema = z.object({
  token: z.string().min(20).max(4096),
  platform: z.enum(["android", "ios"]).default("android"),
});

@Controller("push")
@UseGuards(CsrfGuard, RateLimitGuard)
export class PushController {
  constructor(private readonly push: PushService) {}

  @Post("register")
  @HttpCode(200)
  async register(@CurrentUser() user: RequestUser, @Body() raw: unknown) {
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException("Invalid push token");
    await this.push.register(user.id, parsed.data.token, parsed.data.platform);
    return { ok: true };
  }

  @Post("unregister")
  @HttpCode(200)
  async unregister(@CurrentUser() user: RequestUser, @Body() raw: unknown) {
    const parsed = bodySchema.pick({ token: true }).safeParse(raw);
    if (!parsed.success) throw new BadRequestException("Invalid push token");
    await this.push.unregister(user.id, parsed.data.token);
    return { ok: true };
  }
}
