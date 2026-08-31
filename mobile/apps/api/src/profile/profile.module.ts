import { Module } from "@nestjs/common";
import { MediaModule } from "../media/media.module";
import { PrismaModule } from "../prisma/prisma.module";
import { QueueModule } from "../queue/queue.module";
import { GeolocationService } from "./geolocation.service";
import { PreferencesController } from "./preferences.controller";
import { PreferencesService } from "./preferences.service";
import { ProfileController } from "./profile.controller";
import { ProfilePhotosService } from "./photos.service";
import { ProfileService } from "./profile.service";
import { ScoreRecalcStub } from "./score-recalc.stub";

@Module({
  imports: [PrismaModule, MediaModule, QueueModule],
  controllers: [ProfileController, PreferencesController],
  providers: [
    ProfileService,
    PreferencesService,
    ProfilePhotosService,
    GeolocationService,
    ScoreRecalcStub,
  ],
  exports: [
    ProfileService,
    PreferencesService,
    ProfilePhotosService,
    ScoreRecalcStub,
  ],
})
export class ProfileModule {}
