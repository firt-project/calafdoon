import { Module } from "@nestjs/common";
import { MediaModule } from "../media/media.module";
import { RedisModule } from "../redis/redis.module";
import { RateLimitGuard } from "../redis/rate-limit.guard";
import {
  AdminVerificationController,
  VerificationController,
} from "./verification.controller";
import { VerificationService } from "./verification.service";

@Module({
  imports: [MediaModule, RedisModule],
  controllers: [VerificationController, AdminVerificationController],
  providers: [VerificationService, RateLimitGuard],
})
export class VerificationModule {}
