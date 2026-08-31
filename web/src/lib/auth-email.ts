/** Normalize email for Convex Auth account lookup (provider account id). */
export function normalizeAuthEmail(email: string): string {
  return email.trim().toLowerCase();
}
