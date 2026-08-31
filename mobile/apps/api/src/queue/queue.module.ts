import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ScoreService } from "../matching/score.service";
import { NotificationQueueService } from "./notification-queue.service";
import { ScoreQueueService } from "./score-queue.service";

@Module({
  imports: [PrismaModule],
  providers: [ScoreService, ScoreQueueService, NotificationQueueService],
  exports: [ScoreService, ScoreQueueService, NotificationQueueService],
})
export class QueueModule {}
