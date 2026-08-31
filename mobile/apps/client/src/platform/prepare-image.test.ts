import { describe, expect, it } from "vitest";
import { prepareImageForUpload } from "../../../../packages/api-client/src/adapters/lib/prepare-image";

describe("prepareImageForUpload", () => {
  it("returns a blob for a tiny jpeg-like input", async () => {
    const blob = new Blob(["abc"], { type: "image/jpeg" });
    const out = await prepareImageForUpload(blob);
    expect(out).toBeInstanceOf(Blob);
  });
});
