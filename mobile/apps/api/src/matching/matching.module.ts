import { Module } from "@nestjs/common";
import { MediaModule } from "../media/media.module";
import { PrismaModule } from "../prisma/prisma.module";
import { RedisModule } from "../redis/redis.module";
import { QueueModule } from "../queue/queue.module";
import { MatchController } from "./match.controller";
import { MatchService } from "./match.service";
import { RateLimitGuard } from "../redis/rate-limit.guard";

@Module({
  imports: [PrismaModule, MediaModule, RedisModule, QueueModule],
  controllers: [MatchController],
  providers: [MatchService, RateLimitGuard],
  exports: [MatchService, RateLimitGuard],
})
export class MatchingModule {}
