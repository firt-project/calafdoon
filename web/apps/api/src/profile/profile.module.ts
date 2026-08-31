import { Module, forwardRef } from "@nestjs/common";
import { MediaModule } from "../media/media.module";
import { PrismaModule } from "../prisma/prisma.module";
import { QueueModule } from "../queue/queue.module";
import { AdminModule } from "../admin/admin.module";
import { GeolocationService } from "./geolocation.service";
import { PreferencesController } from "./preferences.controller";
import { PreferencesService } from "./preferences.service";
import { ProfileController } from "./profile.controller";
import { ProfilePhotosService } from "./photos.service";
import { ProfileService } from "./profile.service";
import { ScoreRecalcStub } from "./score-recalc.stub";

@Module({
  imports: [PrismaModule, MediaModule, QueueModule, forwardRef(() => AdminModule)],
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
