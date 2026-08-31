import { describe, expect, it } from "vitest";
import {
  buildE164,
  dialCountryForName,
  searchDialCountries,
  splitPhone,
  stripTrunkZero,
} from "@/lib/country-dial-codes";

describe("country dial codes", () => {
  it("maps profile country to dial code", () => {
    expect(dialCountryForName("Somalia").dial).toBe("252");
    expect(dialCountryForName("Kenya").dial).toBe("254");
    expect(dialCountryForName("Unknown").dial).toBe("252");
  });

  it("builds E.164 and strips trunk zero", () => {
    expect(stripTrunkZero("0612345678")).toBe("612345678");
    expect(buildE164("252", "0612345678")).toBe("+252612345678");
    expect(buildE164("254", "712345678")).toBe("+254712345678");
  });

  it("splits saved phones back into country + national", () => {
    const so = splitPhone("+252612345678", "Kenya");
    expect(so.country.dial).toBe("252");
    expect(so.national).toBe("612345678");

    const empty = splitPhone("", "Kenya");
    expect(empty.country.dial).toBe("254");
    expect(empty.national).toBe("");
  });

  it("searches by name and dial code", () => {
    const byName = searchDialCountries("som");
    expect(byName[0]?.name).toBe("Somalia");

    const byCode = searchDialCountries("252");
    expect(byCode.some((c) => c.dial === "252")).toBe(true);

    const all = searchDialCountries("");
    expect(all.length).toBeGreaterThan(100);
    expect(all[0]?.name).toBe("Somalia");
  });
});
