import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { Roles } from "../auth/auth.guards";
import { RateLimitGuard } from "../redis/rate-limit.guard";
import { AdminPaymentsService } from "./admin-payments.service";

@Controller("admin/payments")
@Roles("admin")
export class AdminPaymentsController {
  constructor(private readonly payments: AdminPaymentsService) {}

  @Get()
  @UseGuards(RateLimitGuard)
  list(
    @Query("status") status?: string,
    @Query("paymentType") paymentType?: string,
    @Query("registrationTier") registrationTier?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string
  ) {
    return this.payments.list({
      status,
      paymentType,
      registrationTier,
      from,
      to,
      cursor,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get("stats")
  stats() {
    return this.payments.stats();
  }

  @Get("quarantine-summary")
  quarantine() {
    return this.payments.quarantineSummary();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.payments.getById(id);
  }
}
