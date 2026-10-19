import { Module } from "@nestjs/common";
import { ChatModule } from "../chat/chat.module";
import { RateLimitGuard } from "../redis/rate-limit.guard";
import { RedisModule } from "../redis/redis.module";
import { ChaperoneController, GuardianViewController } from "./chaperone.controller";
import { ChaperoneService } from "./chaperone.service";

@Module({
  imports: [ChatModule, RedisModule],
  controllers: [ChaperoneController, GuardianViewController],
  providers: [ChaperoneService, RateLimitGuard],
})
export class ChaperoneModule {}
