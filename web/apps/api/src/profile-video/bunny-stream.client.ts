import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  PLAYBACK_TTL_SECONDS,
  TUS_ENDPOINT,
  UPLOAD_AUTH_TTL_SECONDS,
} from "./profile-video.constants";

const API_BASE = "https://video.bunnycdn.com";
const REQUEST_TIMEOUT_MS = 10_000;

/** Subset of Bunny's VideoModel this app relies on. */
export type BunnyVideo = {
  guid: string;
  /** 0 Created, 1 Uploaded, 2 Processing, 3 Transcoding, 4 Finished, 5 Error, 6 UploadFailed */
  status: number;
  length: number;
  encodeProgress: number;
  storageSize: number;
  availableResolutions: string | null;
};

export const BUNNY_STATUS = {
  created: 0,
  uploaded: 1,
  processing: 2,
  transcoding: 3,
  finished: 4,
  error: 5,
  uploadFailed: 6,
} as const;

export type TusCredentials = {
  endpoint: string;
  videoId: string;
  libraryId: string;
  expire: number;
  signature: string;
};

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Bunny TUS: SHA256_HEX(library_id + api_key + expiration_time + video_id). */
export function tusSignature(
  libraryId: string,
  apiKey: string,
  expire: number,
  videoId: string
): string {
  return sha256Hex(`${libraryId}${apiKey}${expire}${videoId}`);
}

/** Embed token auth: SHA256_HEX(token_security_key + video_id + expires). */
export function embedToken(
  tokenKey: string,
  videoId: string,
  expires: number
): string {
  return sha256Hex(`${tokenKey}${videoId}${expires}`);
}

/**
 * Webhook authenticity (Bunny docs): HMAC-SHA256 over the raw body keyed with the
 * library's Read-Only API key, lowercase hex, compared in constant time.
 */
export function verifyWebhookSignature(opts: {
  rawBody: Buffer | string;
  readOnlyKey: string;
  signature: string | undefined;
  version: string | undefined;
  algorithm: string | undefined;
}): boolean {
  if (opts.version !== "v1" || opts.algorithm !== "hmac-sha256") return false;
  if (!opts.signature || !/^[0-9a-f]{64}$/.test(opts.signature)) return false;
  const expected = createHmac("sha256", opts.readOnlyKey)
    .update(opts.rawBody)
    .digest("hex");
  return timingSafeEqual(
    Buffer.from(expected, "utf8"),
    Buffer.from(opts.signature, "utf8")
  );
}

/**
 * Thin server-side Bunny Stream client. The API key never leaves this class:
 * it is only sent in the AccessKey header (or hashed into signatures) and is
 * never logged or included in thrown errors.
 */
@Injectable()
export class BunnyStreamClient {
  private readonly logger = new Logger(BunnyStreamClient.name);

  constructor(private readonly config: ConfigService) {}

  private get libraryId(): string | undefined {
    return this.config.get<string>("BUNNY_STREAM_LIBRARY_ID")?.trim() || undefined;
  }

  private get apiKey(): string | undefined {
    return this.config.get<string>("BUNNY_STREAM_API_KEY")?.trim() || undefined;
  }

  get configured(): boolean {
    return Boolean(this.libraryId && this.apiKey);
  }

  get tokenKeyConfigured(): boolean {
    return Boolean(this.config.get<string>("BUNNY_STREAM_TOKEN_KEY")?.trim());
  }

  get webhookConfigured(): boolean {
    return Boolean(this.config.get<string>("BUNNY_STREAM_READONLY_KEY")?.trim());
  }

  getLibraryId(): string {
    const id = this.libraryId;
    if (!id || !this.apiKey) {
      throw new ServiceUnavailableException("Profile video is not available right now.");
    }
    return id;
  }

  private async call(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: unknown
  ): Promise<{ status: number; json: unknown }> {
    const libraryId = this.getLibraryId();
    const key = this.apiKey!;
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/library/${libraryId}${path}`, {
        method,
        headers: {
          AccessKey: key,
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      // Never include the request (headers carry the key) in logs or errors.
      this.logger.warn(
        `Bunny ${method} ${path.replace(/[0-9a-f-]{36}/g, ":id")} failed: ${
          err instanceof Error ? err.name : "unknown"
        }`
      );
      throw new ServiceUnavailableException("Video service is unavailable. Try again shortly.");
    }
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      /* empty or non-JSON body */
    }
    return { status: res.status, json };
  }

  /** Create the video object; returns its GUID. */
  async createVideo(title: string): Promise<string> {
    const { status, json } = await this.call("POST", "/videos", { title });
    const guid = (json as { guid?: unknown } | null)?.guid;
    if (status !== 200 || typeof guid !== "string" || !guid) {
      this.logger.warn(`Bunny createVideo returned HTTP ${status}`);
      throw new ServiceUnavailableException("Video service is unavailable. Try again shortly.");
    }
    return guid;
  }

  /** Returns null when Bunny reports the video does not exist. */
  async getVideo(videoId: string): Promise<BunnyVideo | null> {
    const { status, json } = await this.call("GET", `/videos/${encodeURIComponent(videoId)}`);
    if (status === 404) return null;
    if (status !== 200 || !json || typeof json !== "object") {
      this.logger.warn(`Bunny getVideo returned HTTP ${status}`);
      throw new ServiceUnavailableException("Video service is unavailable. Try again shortly.");
    }
    const v = json as Record<string, unknown>;
    return {
      guid: String(v.guid ?? videoId),
      status: Number(v.status ?? 0),
      length: Number(v.length ?? 0),
      encodeProgress: Number(v.encodeProgress ?? 0),
      storageSize: Number(v.storageSize ?? 0),
      availableResolutions:
        typeof v.availableResolutions === "string" ? v.availableResolutions : null,
    };
  }

  /** True when deleted or already gone (404). */
  async deleteVideo(videoId: string): Promise<boolean> {
    const { status } = await this.call("DELETE", `/videos/${encodeURIComponent(videoId)}`);
    if (status === 200 || status === 404) return true;
    this.logger.warn(`Bunny deleteVideo returned HTTP ${status}`);
    return false;
  }

  /** Short-lived credentials for a direct browser/app TUS upload. */
  signUpload(videoId: string, now = Date.now()): TusCredentials {
    const libraryId = this.getLibraryId();
    const expire = Math.floor(now / 1000) + UPLOAD_AUTH_TTL_SECONDS;
    return {
      endpoint: TUS_ENDPOINT,
      videoId,
      libraryId,
      expire,
      signature: tusSignature(libraryId, this.apiKey!, expire, videoId),
    };
  }

  /** Player hosts to try, configured one first. Both are documented Bunny embed hosts. */
  playerHosts(): string[] {
    const configured = this.config.get<string>("BUNNY_STREAM_PLAYER_HOST")?.trim().toLowerCase();
    const defaults = ["player.mediadelivery.net", "iframe.mediadelivery.net"];
    // Only Bunny player hosts are valid here. A CDN hostname (…b-cdn.net) is not an embed player,
    // so a mistaken value is ignored instead of breaking playback.
    if (configured && /(^|\.)mediadelivery\.net$/.test(configured)) {
      return [...new Set([configured, ...defaults])];
    }
    return defaults;
  }

  /**
   * HTTP status the player page gives for this link, or null when it could not be checked.
   * Used server-side so a 404 never reaches the member's player box.
   */
  async probePlayer(url: string, referer?: string): Promise<number | null> {
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(6000),
        headers: { Accept: "text/html", ...(referer ? { Referer: referer } : {}) },
      });
      await res.body?.cancel().catch(() => undefined);
      return res.status;
    } catch {
      return null;
    }
  }

  /** Signed embed URL, or an unsigned one when no token key is configured. */
  playbackUrl(
    videoId: string,
    now = Date.now(),
    hostOverride?: string,
    unsigned = false
  ): { url: string; expiresAt: number; host: string } {
    const libraryId = this.getLibraryId();
    const host = hostOverride ?? this.playerHosts()[0]!;
    const expires = Math.floor(now / 1000) + PLAYBACK_TTL_SECONDS;
    const params = new URLSearchParams({
      autoplay: "false",
      preload: "false",
      loop: "false",
      playsinline: "true",
    });
    const tokenKey = this.config.get<string>("BUNNY_STREAM_TOKEN_KEY")?.trim();
    if (tokenKey && !unsigned) {
      params.set("token", embedToken(tokenKey, videoId, expires));
      params.set("expires", String(expires));
    }
    return {
      url: `https://${host}/embed/${libraryId}/${videoId}?${params.toString()}`,
      expiresAt: expires * 1000,
      host,
    };
  }

  verifyWebhook(opts: {
    rawBody: Buffer | string;
    signature: string | undefined;
    version: string | undefined;
    algorithm: string | undefined;
  }): boolean {
    const readOnlyKey = this.config.get<string>("BUNNY_STREAM_READONLY_KEY")?.trim();
    if (!readOnlyKey) return false;
    return verifyWebhookSignature({ ...opts, readOnlyKey });
  }
}
