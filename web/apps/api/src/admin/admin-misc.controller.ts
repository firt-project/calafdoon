import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Roles } from "../auth/auth.guards";
import { CsrfGuard } from "../auth/csrf";
import { RateLimitGuard } from "../redis/rate-limit.guard";
import { AdminChatService } from "./admin-chat.service";
import { AdminStatsService } from "./admin-stats.service";
import { AuditLogService } from "./audit-log.service";
import { MetricsService } from "./metrics.service";

@Controller("admin")
@Roles("admin")
export class AdminMiscController {
  constructor(
    private readonly stats: AdminStatsService,
    private readonly audit: AuditLogService,
    private readonly metrics: MetricsService,
    private readonly chat: AdminChatService
  ) {}

  @Get("stats")
  getStats() {
    return this.stats.getStats();
  }

  @Get("analytics")
  getAnalytics() {
    return this.stats.getAnalytics();
  }

  @Get("activity")
  getActivity(@Query("limit") limit?: string) {
    return this.stats.getActivity(limit ? Number(limit) : 40);
  }

  @Get("conversations")
  listConversations(@Query("limit") limit?: string) {
    return this.chat.listConversations(limit ? Number(limit) : 40);
  }

  @Get("conversations/:id")
  getConversation(
    @Param("id") id: string,
    @Query("limit") limit?: string
  ) {
    return this.chat.getThread(id, limit ? Number(limit) : 500);
  }

  @Get("site-metrics")
  async siteMetrics() {
    const m = await this.metrics.getGlobal();
    return m
      ? {
          ...m,
          metricsUpdatedAt: m.metricsUpdatedAt.toISOString(),
          rebuildScheduledAt: m.rebuildScheduledAt?.toISOString() ?? null,
        }
      : null;
  }

  @Post("site-metrics/rebuild")
  @Roles("owner")
  @UseGuards(CsrfGuard, RateLimitGuard)
  async rebuild() {
    await this.metrics.scheduleRebuild();
    // Force immediate rebuild for owner endpoint
    const result = await this.metrics.rebuildFromStart();
    return { ok: true, updatedAt: result.metricsUpdatedAt };
  }

  @Get("audit-logs")
  @UseGuards(RateLimitGuard)
  auditLogs(
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
    @Query("actorUserId") actorUserId?: string,
    @Query("action") action?: string,
    @Query("targetUserId") targetUserId?: string
  ) {
    return this.audit.list({
      cursor,
      limit: limit ? Number(limit) : undefined,
      actorUserId,
      action,
      targetUserId,
    });
  }

  @Get("audit-logs/:id")
  auditLog(@Param("id") id: string) {
    return this.audit.getById(id);
  }
}
