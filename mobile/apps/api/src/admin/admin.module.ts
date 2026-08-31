import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MediaModule } from "../media/media.module";
import { PaymentsModule } from "../payments/payments.module";
import { PrismaModule } from "../prisma/prisma.module";
import { QueueModule } from "../queue/queue.module";
import { RedisModule } from "../redis/redis.module";
import { RateLimitGuard } from "../redis/rate-limit.guard";
import { AnnouncementQueueService } from "../queue/announcement-queue.service";
import { MetricsQueueService } from "../queue/metrics-queue.service";
import { AuditLogService } from "./audit-log.service";
import { DeletionService } from "./deletion.service";
import { MetricsService } from "./metrics.service";
import { AdminUsersService } from "./admin-users.service";
import { AdminUsersController } from "./admin-users.controller";
import { ModerationService } from "./moderation.service";
import { ModerationController } from "./moderation.controller";
import { AdminEvcController } from "./admin-evc.controller";
import { AdminPaymentsService } from "./admin-payments.service";
import { AdminPaymentsController } from "./admin-payments.controller";
import { SupportService } from "./support.service";
import { SupportController } from "./support.controller";
import { StaffInvitesService } from "./staff-invites.service";
import { StaffInvitesController } from "./staff-invites.controller";
import { AnnouncementsService } from "./announcements.service";
import { AnnouncementsController } from "./announcements.controller";
import { AdminChatService } from "./admin-chat.service";
import { AdminStatsService } from "./admin-stats.service";
import { AdminMiscController } from "./admin-misc.controller";

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    AuthModule,
    QueueModule,
    forwardRef(() => PaymentsModule),
    MediaModule,
  ],
  controllers: [
    AdminUsersController,
    ModerationController,
    AdminEvcController,
    AdminPaymentsController,
    SupportController,
    StaffInvitesController,
    AnnouncementsController,
    AdminMiscController,
  ],
  providers: [
    RateLimitGuard,
    AuditLogService,
    DeletionService,
    MetricsService,
    MetricsQueueService,
    AdminUsersService,
    ModerationService,
    AdminPaymentsService,
    SupportService,
    StaffInvitesService,
    AnnouncementsService,
    AnnouncementQueueService,
    AdminStatsService,
    AdminChatService,
  ],
  exports: [
    AuditLogService,
    MetricsService,
    DeletionService,
    AdminUsersService,
  ],
})
export class AdminModule {}
