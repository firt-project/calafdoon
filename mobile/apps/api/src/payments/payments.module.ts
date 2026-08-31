import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthModule } from "../auth/auth.module";
import { ChatModule } from "../chat/chat.module";
import { MediaModule } from "../media/media.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ProfileModule } from "../profile/profile.module";
import { QueueModule } from "../queue/queue.module";
import { RedisModule } from "../redis/redis.module";
import { RateLimitGuard } from "../redis/rate-limit.guard";
import { AdminModule } from "../admin/admin.module";
import { PaymentMailService } from "../mail/payment-mail.service";
import {
  PaymentEmailQueueService,
  PaymentReconcileQueueService,
} from "../queue/payment-email-queue.service";
import { EvcPaymentsService } from "./evc-payments.service";
import { GrantPaidAccessService } from "./grant-paid-access.service";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import {
  FakeStripeGateway,
  STRIPE_GATEWAY,
  StripeService,
} from "./stripe.gateway";

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    RedisModule,
    MediaModule,
    ChatModule,
    QueueModule,
    ProfileModule,
    AuthModule,
    forwardRef(() => AdminModule),
  ],
  controllers: [PaymentsController],
  providers: [
    RateLimitGuard,
    PaymentMailService,
    PaymentEmailQueueService,
    PaymentReconcileQueueService,
    GrantPaidAccessService,
    PaymentsService,
    EvcPaymentsService,
    {
      provide: STRIPE_GATEWAY,
      useFactory: (config: ConfigService) => {
        if (config.get<string>("STRIPE_GATEWAY") === "fake") {
          return new FakeStripeGateway();
        }
        return new StripeService(config);
      },
      inject: [ConfigService],
    },
  ],
  exports: [
    PaymentsService,
    EvcPaymentsService,
    GrantPaidAccessService,
    PaymentMailService,
    STRIPE_GATEWAY,
  ],
})
export class PaymentsModule {}
