import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Roles, CurrentUser, type RequestUser } from "../auth/auth.guards";
import { RateLimitGuard } from "../redis/rate-limit.guard";
import { AccountStatusService } from "./account-status.service";
import {
  percentChange,
  previousPeriod,
  resolveDateRange,
} from "./date-range";

@Controller("admin/reports")
@Roles("admin")
export class AccountStatusReportsController {
  constructor(private readonly status: AccountStatusService) {}

  @Get("status-period")
  @UseGuards(RateLimitGuard)
  async statusPeriod(
    @Query("preset") preset?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("tz") tz?: string,
    @Query("country") country?: string,
    @Query("compare") compare?: string
  ) {
    let range;
    try {
      range = resolveDateRange({ preset, from, to, timeZone: tz });
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : "Invalid date range"
      );
    }

    const current = await this.status.reportPeriod(
      range.from,
      range.to,
      country || undefined
    );

    let comparison: {
      previous: Awaited<ReturnType<AccountStatusService["reportPeriod"]>>;
      deltas: Record<string, { diff: number; pct: number | null }>;
    } | null = null;

    if (compare === "1" || compare === "true") {
      const prev = previousPeriod(range.from, range.to);
      const previous = await this.status.reportPeriod(
        prev.from,
        prev.to,
        country || undefined
      );
      const keys = [
        "registrations",
        "approved",
        "rejected",
        "paused",
        "resumed",
        "suspended",
        "banned",
        "unbanned",
        "deleted",
        "restored",
        "activeUsers",
        "messages",
        "reports",
        "appealsSubmitted",
      ] as const;
      const deltas: Record<string, { diff: number; pct: number | null }> = {};
      for (const key of keys) {
        const c = Number(current[key] ?? 0);
        const p = Number(previous[key] ?? 0);
        deltas[key] = { diff: c - p, pct: percentChange(c, p) };
      }
      comparison = { previous, deltas };
    }

    return {
      range,
      country: country || null,
      current,
      comparison,
      refreshedAt: new Date().toISOString(),
    };
  }

  @Get("status-period.csv")
  @UseGuards(RateLimitGuard)
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header(
    "Content-Disposition",
    'attachment; filename="status-period-report.csv"'
  )
  async statusPeriodCsv(
    @CurrentUser() user: RequestUser,
    @Query("preset") preset?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("tz") tz?: string,
    @Query("country") country?: string
  ) {
    let range;
    try {
      range = resolveDateRange({ preset, from, to, timeZone: tz });
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : "Invalid date range"
      );
    }
    const current = await this.status.reportPeriod(
      range.from,
      range.to,
      country || undefined
    );
    const generatedAt = new Date().toISOString();
    const lines = [
      "metric,value",
      `generatedAt,${generatedAt}`,
      `generatedBy,${user.id}`,
      `timezone,${range.timeZone}`,
      `preset,${range.preset}`,
      `from,${current.from}`,
      `to,${current.to}`,
      `country,${country || "all"}`,
      `registrations,${current.registrations}`,
      `approved,${current.approved}`,
      `rejected,${current.rejected}`,
      `pendingSnapshot,${current.pendingSnapshot}`,
      `paused,${current.paused}`,
      `resumed,${current.resumed}`,
      `suspended,${current.suspended}`,
      `banned,${current.banned}`,
      `unbanned,${current.unbanned}`,
      `deleted,${current.deleted}`,
      `restored,${current.restored}`,
      `activeUsers,${current.activeUsers}`,
      `messages,${current.messages}`,
      `reports,${current.reports}`,
      `appealsSubmitted,${current.appealsSubmitted}`,
      `appealsReviewed,${current.appealsReviewed}`,
    ];
    return lines.join("\n");
  }
}
