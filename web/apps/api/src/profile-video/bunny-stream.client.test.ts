import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { afterEach, describe, it } from "node:test";
import { ServiceUnavailableException } from "@nestjs/common";
import {
  BunnyStreamClient,
  embedToken,
  tusSignature,
  verifyWebhookSignature,
} from "./bunny-stream.client";

const KEY = "test-api-key-DO-NOT-LEAK";

function client(env: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    BUNNY_STREAM_LIBRARY_ID: "12345",
    BUNNY_STREAM_API_KEY: KEY,
    BUNNY_STREAM_READONLY_KEY: "readonly-key",
    BUNNY_STREAM_TOKEN_KEY: "token-key",
    ...env,
  };
  return new BunnyStreamClient({ get: (k: string) => values[k] } as never);
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = (async (url: unknown, init?: RequestInit) =>
    handler(String(url), init ?? {})) as typeof fetch;
}

describe("Bunny signatures", () => {
  it("TUS signature = SHA256_HEX(library + key + expire + video)", () => {
    const expected = createHash("sha256").update("12345" + "k" + "1700000000" + "vid").digest("hex");
    assert.equal(tusSignature("12345", "k", 1700000000, "vid"), expected);
  });

  it("embed token = SHA256_HEX(key + video + expires)", () => {
    const expected = createHash("sha256").update("sec" + "vid" + "1700000000").digest("hex");
    assert.equal(embedToken("sec", "vid", 1700000000), expected);
  });

  it("signUpload binds credentials to the video and expiry", () => {
    const c = client();
    const creds = c.signUpload("vid-1", 1_700_000_000_000);
    assert.equal(creds.libraryId, "12345");
    assert.equal(creds.videoId, "vid-1");
    assert.equal(creds.expire, 1_700_000_000 + 2 * 60 * 60);
    assert.equal(creds.signature, tusSignature("12345", KEY, creds.expire, "vid-1"));
    assert.ok(!JSON.stringify(creds).includes(KEY), "API key must not appear in credentials");
  });

  it("playbackUrl is token-signed and never contains the API key", () => {
    const { url } = client().playbackUrl("vid-1", 1_700_000_000_000);
    assert.ok(url.startsWith("https://player.mediadelivery.net/embed/12345/vid-1?"));
    assert.ok(url.includes("token="));
    assert.ok(url.includes("autoplay=false"));
    assert.ok(!url.includes(KEY));
  });
});

describe("webhook signature", () => {
  const body = JSON.stringify({ VideoLibraryId: 12345, VideoGuid: "g", Status: 3 });
  const good = createHmac("sha256", "readonly-key").update(body).digest("hex");
  const base = { rawBody: body, readOnlyKey: "readonly-key", version: "v1", algorithm: "hmac-sha256" };

  it("accepts a correctly signed body", () => {
    assert.equal(verifyWebhookSignature({ ...base, signature: good }), true);
  });
  it("rejects a tampered body", () => {
    assert.equal(verifyWebhookSignature({ ...base, rawBody: body + " ", signature: good }), false);
  });
  it("rejects wrong key, version, algorithm or malformed signature", () => {
    assert.equal(verifyWebhookSignature({ ...base, readOnlyKey: "other", signature: good }), false);
    assert.equal(verifyWebhookSignature({ ...base, version: "v2", signature: good }), false);
    assert.equal(verifyWebhookSignature({ ...base, algorithm: "hmac-sha1", signature: good }), false);
    assert.equal(verifyWebhookSignature({ ...base, signature: "abc" }), false);
    assert.equal(verifyWebhookSignature({ ...base, signature: undefined }), false);
  });
  it("client.verifyWebhook fails closed without a read-only key", () => {
    const c = client({ BUNNY_STREAM_READONLY_KEY: undefined });
    assert.equal(c.verifyWebhook({ rawBody: body, signature: good, version: "v1", algorithm: "hmac-sha256" }), false);
  });
});

describe("Bunny API errors", () => {
  it("createVideo sends the AccessKey header and returns the guid", async () => {
    let seen: Headers | undefined;
    mockFetch((url, init) => {
      assert.equal(url, "https://video.bunnycdn.com/library/12345/videos");
      seen = new Headers(init.headers);
      return new Response(JSON.stringify({ guid: "abc" }), { status: 200 });
    });
    assert.equal(await client().createVideo("t"), "abc");
    assert.equal(seen?.get("accesskey"), KEY);
  });

  it("maps Bunny 5xx to a generic 503 without leaking the key", async () => {
    mockFetch(() => new Response("boom", { status: 500 }));
    await assert.rejects(client().createVideo("t"), (e: unknown) => {
      assert.ok(e instanceof ServiceUnavailableException);
      assert.ok(!String((e as Error).message).includes(KEY));
      return true;
    });
  });

  it("maps network errors / timeouts to a generic 503", async () => {
    mockFetch(() => {
      const err = new Error(`connect to Bunny failed ${KEY}`);
      err.name = "TimeoutError";
      throw err;
    });
    await assert.rejects(client().getVideo("v"), (e: unknown) => {
      assert.ok(e instanceof ServiceUnavailableException);
      assert.ok(!String((e as Error).message).includes(KEY));
      return true;
    });
  });

  it("getVideo returns null on 404 and parses a finished video", async () => {
    mockFetch(() => new Response("{}", { status: 404 }));
    assert.equal(await client().getVideo("v"), null);
    mockFetch(
      () =>
        new Response(
          JSON.stringify({ guid: "v", status: 4, length: 21, encodeProgress: 100, storageSize: 5, availableResolutions: "360p,720p" }),
          { status: 200 }
        )
    );
    const v = await client().getVideo("v");
    assert.equal(v?.status, 4);
    assert.equal(v?.length, 21);
  });

  it("deleteVideo treats 404 as success and failures as false", async () => {
    mockFetch(() => new Response("{}", { status: 404 }));
    assert.equal(await client().deleteVideo("v"), true);
    mockFetch(() => new Response("{}", { status: 500 }));
    assert.equal(await client().deleteVideo("v"), false);
  });

  it("is a no-op configuration error when credentials are missing", () => {
    const c = client({ BUNNY_STREAM_API_KEY: undefined });
    assert.equal(c.configured, false);
    assert.throws(() => c.getLibraryId(), ServiceUnavailableException);
  });
});
