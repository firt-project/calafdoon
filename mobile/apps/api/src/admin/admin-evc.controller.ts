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
  Roles,
  type RequestUser,
} from "../auth/auth.guards";
import { CsrfGuard } from "../auth/csrf";
import { RateLimitGuard } from "../redis/rate-limit.guard";
import { EvcPaymentsService } from "../payments/evc-payments.service";
import { PrismaService } from "../prisma/prisma.service";

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues[0]?.message ?? "Invalid request body"
    );
  }
  return result.data;
}

@Controller("admin/evc")
@Roles("admin")
export class AdminEvcController {
  constructor(
    private readonly evc: EvcPaymentsService,
    private readonly prisma: PrismaService
  ) {}

  @Get("pending")
  @UseGuards(RateLimitGuard)
  pending(@CurrentUser() user: RequestUser) {
    return this.evc.listPending(user.id);
  }

  @Get("count")
  async count() {
    const pending = await this.prisma.evcPaymentProof.count({
      where: { status: "pending" },
    });
    return { pending };
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    const proof = await this.prisma.evcPaymentProof.findUnique({
      where: { id },
      include: {
        user: { select: { email: true } },
        profile: { select: { name: true, gender: true, phone: true } },
      },
    });
    if (!proof) throw new BadRequestException("Payment proof not found");
    return {
      id: proof.id,
      status: proof.status,
      tier: proof.tier,
      amountCents: proof.amountCents,
      payerFullName: proof.payerFullName,
      lastFourDigits: proof.lastFourDigits,
      createdAt: proof.proofCreatedAt.toISOString(),
      rejectionReason: proof.rejectionReason,
      userEmail: proof.user.email,
      profileName: proof.profile.name,
      gender: proof.profile.gender,
    };
  }

  @Post(":id/approve")
  @UseGuards(CsrfGuard, RateLimitGuard)
  approve(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.evc.approveProof(user.id, id);
  }

  @Post(":id/reject")
  @UseGuards(CsrfGuard, RateLimitGuard)
  reject(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const parsed = parseBody(
      z.object({ reason: z.string().max(2000).optional() }),
      body ?? {}
    );
    return this.evc.rejectProof(user.id, id, parsed.reason);
  }
}
