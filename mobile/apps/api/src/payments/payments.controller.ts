import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
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
import { EvcPaymentsService } from "./evc-payments.service";
import { PaymentsService } from "./payments.service";

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
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly evc: EvcPaymentsService
  ) {}

  @Post("payments/stripe/registration-checkout")
  @HttpCode(200)
  @UseGuards(CsrfGuard, RateLimitGuard)
  @RequireProfile()
  async registrationCheckout(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown
  ) {
    const parsed = parseBody(
      z.object({
        tier: z.enum(["basic", "premium"]),
        client: z.enum(["web", "mobile"]).optional(),
      }),
      body
    );
    return this.payments.createRegistrationCheckout(
      user.id,
      parsed.tier,
      parsed.client ?? "web"
    );
  }

  @Post("payments/stripe/premium-upgrade-checkout")
  @HttpCode(200)
  @UseGuards(CsrfGuard, RateLimitGuard)
  @RequireProfile()
  async premiumUpgrade(
    @CurrentUser() user: RequestUser,
    @Body() body: unknown
  ) {
    const parsed = parseBody(
      z.object({ client: z.enum(["web", "mobile"]).optional() }),
      body && typeof body === "object" ? body : {}
    );
    return this.payments.createPremiumUpgradeCheckout(
      user.id,
      parsed.client ?? "web"
    );
  }

  @Get("payments/status")
  @UseGuards(RateLimitGuard)
  @RequireProfile()
  async status(@CurrentUser() user: RequestUser) {
    return this.payments.getStatus(user.id);
  }

  @Post("payments/stripe/verify-session")
  @HttpCode(200)
  @UseGuards(CsrfGuard, RateLimitGuard)
  @RequireProfile()
  async verify(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const parsed = parseBody(
      z.object({ sessionId: z.string().min(5).max(256) }),
      body
    );
    return this.payments.verifySession(user.id, parsed.sessionId);
  }

  @Public()
  @Post("webhooks/stripe")
  @HttpCode(200)
  async stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers("stripe-signature") signature?: string
  ) {
    const raw =
      req.rawBody ??
      (typeof req.body === "string" || Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(JSON.stringify(req.body ?? {})));
    return this.payments.handleWebhook(raw, signature);
  }

  @Post("payments/evc/proof/sign-upload")
  @HttpCode(200)
  @UseGuards(CsrfGuard, RateLimitGuard)
  @RequireProfile()
  async evcSign(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const parsed = parseBody(
      z.object({
        contentType: z.string().min(3).max(100),
        sizeBytes: z.number().int().positive().optional(),
      }),
      body
    );
    return this.evc.signUpload(user.id, parsed);
  }

  @Post("payments/evc/proof/upload")
  @HttpCode(200)
  @UseGuards(CsrfGuard, RateLimitGuard)
  @RequireProfile()
  async evcUpload(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const parsed = parseBody(
      z.object({
        contentType: z.string().min(3).max(100).optional(),
        dataBase64: z.string().min(32).max(12_000_000),
      }),
      body
    );
    return this.evc.uploadProofImage(user.id, {
      contentType: parsed.contentType || "image/jpeg",
      dataBase64: parsed.dataBase64,
    });
  }

  @Post("payments/evc/proof/submit")
  @HttpCode(200)
  @UseGuards(CsrfGuard, RateLimitGuard)
  @RequireProfile()
  async evcSubmit(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    const parsed = parseBody(
      z.object({
        tier: z.enum(["basic", "premium"]),
        payerFullName: z.string().min(3).max(120),
        lastFourDigits: z.string().min(4).max(32),
        mediaId: z.string().uuid(),
      }),
      body
    );
    return this.evc.submitProof(user.id, parsed);
  }

  @Get("payments/evc/me/latest")
  @UseGuards(RateLimitGuard)
  @RequireProfile()
  async evcLatest(@CurrentUser() user: RequestUser) {
    return this.evc.myLatest(user.id);
  }

  @Get("payments/evc/admin/pending")
  @UseGuards(CsrfGuard, RateLimitGuard)
  @Roles("admin", "owner")
  @RequireProfile()
  async evcPending(@CurrentUser() user: RequestUser) {
    return this.evc.listPending(user.id);
  }

  @Post("payments/evc/admin/:proofId/approve")
  @HttpCode(200)
  @UseGuards(CsrfGuard, RateLimitGuard)
  @Roles("admin", "owner")
  @RequireProfile()
  async evcApprove(
    @CurrentUser() user: RequestUser,
    @Param("proofId") proofId: string
  ) {
    return this.evc.approveProof(user.id, proofId);
  }

  @Post("payments/evc/admin/:proofId/reject")
  @HttpCode(200)
  @UseGuards(CsrfGuard, RateLimitGuard)
  @Roles("admin", "owner")
  @RequireProfile()
  async evcReject(
    @CurrentUser() user: RequestUser,
    @Param("proofId") proofId: string,
    @Body() body: unknown
  ) {
    const parsed = parseBody(
      z.object({ reason: z.string().max(500).optional() }),
      body ?? {}
    );
    return this.evc.rejectProof(user.id, proofId, parsed.reason);
  }
}
