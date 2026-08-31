import { Controller, Get, Param, Res } from "@nestjs/common";
import type { Response } from "express";
import { Readable } from "node:stream";
import {
  CurrentUser,
  RequireProfile,
  type RequestUser,
} from "../auth/auth.guards";
import { MediaAccessService } from "./media-access.service";

@Controller("media")
@RequireProfile()
export class MediaController {
  constructor(private readonly media: MediaAccessService) {}

  /**
   * Authenticated media proxy for admin/member UIs.
   * Call via apiClient (sends X-Session-Token) and display as a blob URL.
   */
  @Get(":id")
  async get(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Res() res: Response
  ) {
    const stream = await this.media.getObjectStream(id, {
      userId: user.id,
      roles: [user.role],
    });

    res.setHeader("Content-Type", stream.contentType);
    res.setHeader("Cache-Control", "private, max-age=60");
    if (stream.contentLength != null) {
      res.setHeader("Content-Length", String(stream.contentLength));
    }

    const body = stream.body;
    if (!body) {
      res.status(404).end();
      return;
    }

    if (body instanceof Readable) {
      body.pipe(res);
      return;
    }

    const maybeWeb = body as {
      transformToByteArray?: () => Promise<Uint8Array>;
    };
    if (typeof maybeWeb.transformToByteArray === "function") {
      const bytes = await maybeWeb.transformToByteArray();
      res.end(Buffer.from(bytes));
      return;
    }

    res.status(500).end();
  }
}
