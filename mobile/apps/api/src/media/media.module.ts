import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { MediaAccessService } from "./media-access.service";
import { MediaController } from "./media.controller";

@Module({
  imports: [PrismaModule],
  controllers: [MediaController],
  providers: [MediaAccessService],
  exports: [MediaAccessService],
})
export class MediaModule {}
