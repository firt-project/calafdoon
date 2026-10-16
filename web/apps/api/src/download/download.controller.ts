import { Controller, Get, GoneException, Redirect } from "@nestjs/common";
import { Public } from "../auth/auth.guards";

/**
 * The app is distributed through Google Play. The old public APK (a debuggable build of an
 * earlier project) was removed: this route now sends visitors to the store listing, and the
 * old direct-download URL answers 410 Gone.
 */
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.helcalaf.app";

@Controller("download")
export class DownloadController {
  @Public()
  @Get()
  @Redirect(PLAY_STORE_URL, 302)
  installPage() {
    return;
  }

  @Public()
  @Get("web.apk")
  downloadApk() {
    throw new GoneException("Install the app from Google Play.");
  }
}
