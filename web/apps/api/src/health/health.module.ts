import { Module, forwardRef } from "@nestjs/common";
import { ChatModule } from "../chat/chat.module";
import { ObservabilityModule } from "../observability/observability.module";
import { PrismaModule } from "../prisma/prisma.module";
import { QueueModule } from "../queue/queue.module";
import { RedisModule } from "../redis/redis.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    QueueModule,
    ObservabilityModule,
    forwardRef(() => ChatModule),
  ],
  controllers: [HealthController],
})
export class HealthModule {}
