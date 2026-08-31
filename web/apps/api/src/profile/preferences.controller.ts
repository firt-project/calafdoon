import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
  Patch,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import {
  CurrentUser,
  RequireProfile,
  type RequestUser,
} from "../auth/auth.guards";
import { CsrfGuard } from "../auth/csrf";
import { PreferencesService } from "./preferences.service";

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException("Invalid request body");
  }
  return result.data;
}

const prefsSchema = z
  .object({
    preferredGender: z.enum(["male", "female"]).optional(),
    minAge: z.number().int().optional(),
    maxAge: z.number().int().optional(),
    minHeight: z.number().int().optional(),
    maxHeight: z.number().int().optional(),
    minWeight: z.number().int().optional(),
    maxWeight: z.number().int().optional(),
    preferredCountries: z.array(z.string()).optional(),
    acceptChildren: z.string().optional(),
    educationLevel: z.string().optional(),
    religiousLevel: z.string().nullable().optional(),
    acceptDivorcee: z.string().optional(),
    acceptWidow: z.string().optional(),
    maxDistance: z.string().nullable().optional(),
    qualities: z.array(z.string()).optional(),
    hobbies: z.array(z.string()).optional(),
    partnerBeard: z.string().nullable().optional(),
    partnerHijabLevel: z.string().nullable().optional(),
    readyToRelocate: z.string().nullable().optional(),
  })
  .strict();

@Controller("preferences")
@UseGuards(CsrfGuard)
@RequireProfile()
export class PreferencesController {
  constructor(private readonly preferences: PreferencesService) {}

  @Get("me")
  async getMe(@CurrentUser() user: RequestUser) {
    return { preferences: await this.preferences.getMe(user.id) };
  }

  @Put("me")
  async putMe(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const parsed = parseBody(prefsSchema, body);
    return {
      preferences: await this.preferences.putMe(
        user.id,
        parsed as Record<string, unknown>
      ),
    };
  }

  @Patch("me")
  async patchMe(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const parsed = parseBody(prefsSchema, body);
    return {
      preferences: await this.preferences.patchMe(
        user.id,
        parsed as Record<string, unknown>
      ),
    };
  }
}
