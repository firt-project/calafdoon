import { Module } from "@nestjs/common";
import { ChatModule } from "../chat/chat.module";
import { MediaModule } from "../media/media.module";
import { PrismaModule } from "../prisma/prisma.module";
import { RedisModule } from "../redis/redis.module";
import { RateLimitGuard } from "../redis/rate-limit.guard";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";

@Module({
  imports: [PrismaModule, MediaModule, RedisModule, ChatModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, RateLimitGuard],
  exports: [NotificationsService],
})
export class NotificationsModule {}
