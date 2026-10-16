import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GoneException } from "@nestjs/common";
import { DownloadController } from "./download.controller";

describe("DownloadController", () => {
  it("no longer serves the legacy APK", () => {
    const c = new DownloadController();
    assert.throws(() => c.downloadApk(), GoneException);
  });

  it("sends the install page to Google Play", () => {
    const meta = Reflect.getMetadata("__redirect__", DownloadController.prototype.installPage) as
      | { url: string; statusCode: number }
      | undefined;
    assert.match(String(meta?.url), /^https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.helcalaf\.app$/);
    assert.equal(meta?.statusCode, 302);
  });
});
