import type { ConfigService } from "@nestjs/config";

/**
 * L4 rollout: mandatory staff MFA enrollment.
 * Default OFF (safe for local/dev). Enable in production only after at least
 * one owner has enrolled and verified TOTP + recovery-code login.
 */
export function isStaffMfaRequired(config: ConfigService): boolean {
  const raw = (config.get<string>("REQUIRE_STAFF_MFA") ?? "")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}
