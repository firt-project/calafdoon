import { Global, Module } from "@nestjs/common";
import { RedisModule } from "../redis/redis.module";
import { RateLimitGuard } from "../redis/rate-limit.guard";
import { MatchNudgeService } from "./match-nudge.service";
import { PushController } from "./push.controller";
import { PushService } from "./push.service";

@Global()
@Module({
  imports: [RedisModule],
  controllers: [PushController],
  providers: [PushService, MatchNudgeService, RateLimitGuard],
  exports: [PushService],
})
export class PushModule {}
