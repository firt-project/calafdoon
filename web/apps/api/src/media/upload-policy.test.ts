import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import {
  assertStoredUpload,
  assertUploadIntent,
  MAX_UPLOAD_BYTES,
  normalizeUploadContentType,
  UPLOAD_MAX_BYTES,
} from "./upload-policy";

describe("upload-policy (H3)", () => {
  it("allows valid profile image within the size limit", () => {
    const r = assertUploadIntent({
      purpose: "profile_main",
      contentType: "image/jpeg",
      sizeBytes: 100_000,
    });
    assert.equal(r.contentType, "image/jpeg");
    assert.equal(r.maxBytes, MAX_UPLOAD_BYTES);
  });

  it("rejects profile image above the limit", () => {
    assert.throws(
      () =>
        assertUploadIntent({
          purpose: "profile_additional",
          contentType: "image/png",
          sizeBytes: MAX_UPLOAD_BYTES + 1,
        }),
      BadRequestException
    );
  });

  it("allows valid chat image within the limit", () => {
    const r = assertUploadIntent({
      purpose: "chat_image",
      contentType: "image/webp",
      sizeBytes: 50_000,
    });
    assert.equal(r.sizeBytes, 50_000);
    assert.equal(r.maxBytes, UPLOAD_MAX_BYTES.chat_image);
  });

  it("rejects chat image above its limit", () => {
    assert.throws(
      () =>
        assertUploadIntent({
          purpose: "chat_image",
          contentType: "image/jpeg",
          sizeBytes: UPLOAD_MAX_BYTES.chat_image + 1,
        }),
      BadRequestException
    );
  });

  it("allows valid EVC image within the limit", () => {
    const r = assertUploadIntent({
      purpose: "evc_screenshot",
      contentType: "image/png",
      sizeBytes: 4 * 1024 * 1024,
    });
    assert.equal(r.maxBytes, UPLOAD_MAX_BYTES.evc_screenshot);
  });

  it("rejects EVC image above its limit", () => {
    assert.throws(
      () =>
        assertUploadIntent({
          purpose: "evc_screenshot",
          contentType: "image/jpeg",
          sizeBytes: UPLOAD_MAX_BYTES.evc_screenshot + 1,
        }),
      BadRequestException
    );
  });

  it("rejects unsupported MIME type", () => {
    assert.throws(
      () =>
        assertUploadIntent({
          purpose: "profile_main",
          contentType: "application/pdf",
          sizeBytes: 1000,
        }),
      BadRequestException
    );
  });

  it("rejects missing content length", () => {
    assert.throws(
      () =>
        assertUploadIntent({
          purpose: "profile_main",
          contentType: "image/jpeg",
          sizeBytes: undefined,
        }),
      /sizeBytes is required/
    );
  });

  it("rejects zero content length", () => {
    assert.throws(
      () =>
        assertUploadIntent({
          purpose: "chat_image",
          contentType: "image/jpeg",
          sizeBytes: 0,
        }),
      BadRequestException
    );
  });

  it("rejects negative content length", () => {
    assert.throws(
      () =>
        assertUploadIntent({
          purpose: "evc_screenshot",
          contentType: "image/jpeg",
          sizeBytes: -1,
        }),
      BadRequestException
    );
  });

  it("normalizes image/jpg to image/jpeg", () => {
    assert.equal(normalizeUploadContentType("image/jpg"), "image/jpeg");
    const r = assertUploadIntent({
      purpose: "profile_private",
      contentType: "IMAGE/JPG",
      sizeBytes: 10,
    });
    assert.equal(r.contentType, "image/jpeg");
  });

  it("rejects actual size mismatch at finalization", () => {
    assert.throws(
      () =>
        assertStoredUpload({
          purpose: "profile_main",
          contentType: "image/jpeg",
          sizeBytes: 2000,
          declaredSizeBytes: 1000,
        }),
      /does not match/
    );
  });

  it("rejects oversized stored object", () => {
    assert.throws(
      () =>
        assertStoredUpload({
          purpose: "chat_image",
          contentType: "image/jpeg",
          sizeBytes: MAX_UPLOAD_BYTES + 5,
          declaredSizeBytes: MAX_UPLOAD_BYTES + 5,
        }),
      BadRequestException
    );
  });

  it("accepts matching stored object", () => {
    const r = assertStoredUpload({
      purpose: "evc_screenshot",
      contentType: "image/webp",
      sizeBytes: 2048,
      declaredSizeBytes: 2048,
    });
    assert.equal(r.sizeBytes, 2048);
  });

  it("rejects empty stored object without 500", () => {
    assert.throws(
      () =>
        assertStoredUpload({
          purpose: "profile_main",
          contentType: "image/jpeg",
          sizeBytes: 0,
        }),
      BadRequestException
    );
  });
});
