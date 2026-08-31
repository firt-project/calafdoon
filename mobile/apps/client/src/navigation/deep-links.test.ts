import { describe, expect, it } from "vitest";
import {
  isAllowedDeepLinkPath,
  pathFromDeepLinkUrl,
} from "@/navigation/deep-links";

describe("deep-link validation", () => {
  it("normalizes custom-scheme host paths", () => {
    expect(pathFromDeepLinkUrl("helcalaf://login").path).toBe("/login");
    expect(pathFromDeepLinkUrl("helcalaf://messages/abc").path).toBe(
      "/messages/abc"
    );
  });

  it("allows member and auth paths", () => {
    expect(isAllowedDeepLinkPath("/login")).toBe(true);
    expect(isAllowedDeepLinkPath("/messages/abc")).toBe(true);
    expect(isAllowedDeepLinkPath("/legal/privacy")).toBe(true);
    expect(isAllowedDeepLinkPath("/onboarding/gender")).toBe(true);
    expect(isAllowedDeepLinkPath("/matches")).toBe(true);
  });

  it("blocks privileged and unknown paths", () => {
    expect(isAllowedDeepLinkPath("/admin")).toBe(false);
    expect(isAllowedDeepLinkPath("/admin/users")).toBe(false);
    expect(isAllowedDeepLinkPath("/api/secret")).toBe(false);
    expect(isAllowedDeepLinkPath("/loginfoo")).toBe(false);
  });
});
