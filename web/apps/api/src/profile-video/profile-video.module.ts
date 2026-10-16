import { Global, Module } from "@nestjs/common";
import { RedisModule } from "../redis/redis.module";
import { RateLimitGuard } from "../redis/rate-limit.guard";
import { BunnyStreamClient } from "./bunny-stream.client";
import {
  BunnyStreamWebhookController,
  ProfileVideoController,
} from "./profile-video.controller";
import { ProfileVideoService } from "./profile-video.service";

@Global()
@Module({
  imports: [RedisModule],
  controllers: [ProfileVideoController, BunnyStreamWebhookController],
  providers: [BunnyStreamClient, ProfileVideoService, RateLimitGuard],
  exports: [BunnyStreamClient, ProfileVideoService],
})
export class ProfileVideoModule {}
