import type { TranslationPath } from "@/lib/i18n/translations";

const CONTACT_ERROR_KEYS: Record<string, TranslationPath> = {
  "Name is required": "contactPage.errorName",
  "Invalid email": "contactPage.errorEmail",
  "Subject is required": "contactPage.errorSubject",
  "Message is too short": "contactPage.errorMessage",
  "AUTH_RESEND_KEY is not configured on Convex": "contactPage.errorNotConfigured",
  // Match stripped / variant server messages without exposing them in UI copy.
  "Could not send message. Please try WhatsApp instead.": "contactPage.failed",
};

export function getContactErrorKey(error: unknown): TranslationPath | null {
  if (!(error instanceof Error)) return null;
  return CONTACT_ERROR_KEYS[error.message] ?? null;
}
