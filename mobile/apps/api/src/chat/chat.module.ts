import { Module } from "@nestjs/common";
import { MediaModule } from "../media/media.module";
import { PrismaModule } from "../prisma/prisma.module";
import { QueueModule } from "../queue/queue.module";
import { RedisModule } from "../redis/redis.module";
import { RateLimitGuard } from "../redis/rate-limit.guard";
import { ChatGateway } from "./chat.gateway";
import { ChatRealtimeService } from "./chat-realtime.service";
import { ConversationController } from "./conversation.controller";
import { ConversationService } from "./conversation.service";
import { TypingService } from "./typing.service";

@Module({
  imports: [PrismaModule, MediaModule, RedisModule, QueueModule],
  controllers: [ConversationController],
  providers: [
    ConversationService,
    TypingService,
    ChatRealtimeService,
    ChatGateway,
    RateLimitGuard,
  ],
  exports: [
    ConversationService,
    ChatRealtimeService,
    TypingService,
    ChatGateway,
  ],
})
export class ChatModule {}
