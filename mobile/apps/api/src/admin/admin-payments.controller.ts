import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Roles } from "../auth/auth.guards";
import { RateLimitGuard } from "../redis/rate-limit.guard";
import { AdminPaymentsService } from "./admin-payments.service";

@Controller("admin/payments")
@Roles("admin")
export class AdminPaymentsController {
  constructor(private readonly payments: AdminPaymentsService) {}

  @Get("dashboard")
  @UseGuards(RateLimitGuard)
  dashboard(@Query("from") from?: string, @Query("to") to?: string) {
    return this.payments.dashboard({ from, to });
  }

  @Get("revenue-chart")
  @UseGuards(RateLimitGuard)
  revenueChart(
    @Query("days") days?: string,
    @Query("from") from?: string,
    @Query("to") to?: string
  ) {
    return this.payments.revenueChart({
      days: days ? Number(days) : undefined,
      from,
      to,
    });
  }

  @Get("export")
  @UseGuards(RateLimitGuard)
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="hel-payments.csv"')
  exportCsv(
    @Query("status") status?: string,
    @Query("gateway") gateway?: string,
    @Query("from") from?: string,
    @Query("to") to?: string
  ) {
    return this.payments.exportCsv({ status, gateway, from, to });
  }

  @Get("waafi-lookup")
  @UseGuards(RateLimitGuard)
  waafiLookup(@Query("q") q?: string) {
    return this.payments.waafiLookup(q ?? "");
  }

  @Get("memberships")
  @UseGuards(RateLimitGuard)
  memberships(
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string
  ) {
    return this.payments.listMemberships({
      cursor,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get("activity")
  @UseGuards(RateLimitGuard)
  activity(
    @Query("gateway") gateway?: string,
    @Query("limit") limit?: string
  ) {
    return this.payments.activity({
      gateway,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get("evc-proofs")
  @UseGuards(RateLimitGuard)
  evcProofs(
    @Query("status") status?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string
  ) {
    return this.payments.listEvcProofs({
      status,
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

  @Get()
  @UseGuards(RateLimitGuard)
  list(
    @Query("status") status?: string,
    @Query("paymentType") paymentType?: string,
    @Query("registrationTier") registrationTier?: string,
    @Query("gateway") gateway?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string
  ) {
    return this.payments.list({
      status,
      paymentType,
      registrationTier,
      gateway,
      from,
      to,
      cursor,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.payments.getById(id);
  }
}
