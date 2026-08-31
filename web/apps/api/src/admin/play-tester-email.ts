/**
 * Sanitize member emails for Google Play Console tester CSV uploads.
 * Fixes common Gmail domain typos stored in profiles; drops anything still invalid.
 */

const EMAIL_RE =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

/** Trailing junk / mistyped TLD after a real provider domain. */
export const DOMAIN_TYPO_FIXES: Array<[RegExp, string]> = [
  [/@gmail\.come$/i, "@gmail.com"],
  [/@gmail\.coms$/i, "@gmail.com"],
  [/@gmail\.comh$/i, "@gmail.com"],
  [/@gmail\.comm$/i, "@gmail.com"],
  [/@gmail\.coma$/i, "@gmail.com"],
  [/@gmail\.comn$/i, "@gmail.com"],
  [/@gmail\.con$/i, "@gmail.com"],
  [/@gmail\.ckm$/i, "@gmail.com"],
  [/@gmail\.cpm$/i, "@gmail.com"],
  [/@gmail\.cm$/i, "@gmail.com"],
  [/@googlemail\.con$/i, "@googlemail.com"],
  [/@googlemail\.come$/i, "@googlemail.com"],
  [/@yahoo\.con$/i, "@yahoo.com"],
  [/@yahoo\.come$/i, "@yahoo.com"],
  [/@hotmail\.con$/i, "@hotmail.com"],
  [/@hotmail\.come$/i, "@hotmail.com"],
  [/@outlook\.con$/i, "@outlook.com"],
  [/@outlook\.come$/i, "@outlook.com"],
];

export function detectEmailDomainTypo(
  raw: string
): { original: string; fixed: string } | null {
  const email = raw.trim().toLowerCase().replace(/[,;\s]+$/g, "");
  if (!email.includes("@")) return null;
  for (const [pattern, replacement] of DOMAIN_TYPO_FIXES) {
    if (!pattern.test(email)) continue;
    const fixed = email.replace(pattern, replacement);
    if (fixed !== email && EMAIL_RE.test(fixed)) {
      return { original: email, fixed };
    }
  }
  return null;
}

export function sanitizeEmailForPlayExport(raw: string): string | null {
  let email = raw.trim().toLowerCase().replace(/[,;\s]+$/g, "");
  if (!email || !email.includes("@")) return null;

  const typo = detectEmailDomainTypo(email);
  if (typo) email = typo.fixed;

  if (!EMAIL_RE.test(email)) return null;
  const domain = email.split("@")[1] ?? "";
  if (!domain.includes(".") || domain.endsWith(".")) return null;
  return email;
}
