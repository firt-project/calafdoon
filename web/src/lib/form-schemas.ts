import { z } from "zod";
import type { TranslationPath } from "@/lib/i18n/translations";
import { isValidContactPhone } from "@/lib/phone";

export type TranslateFn = (
  key: TranslationPath,
  params?: Record<string, string | number>
) => string;

export function createLoginSchema(t: TranslateFn) {
  return z.object({
    email: z
      .string()
      .email(t("validation.invalidEmail"))
      .transform((value) => value.trim().toLowerCase()),
    password: z.string().min(6, t("validation.passwordMin6")),
  });
}

export function createAccountSchema(t: TranslateFn) {
  return z
    .object({
      email: z
        .string()
        .email(t("validation.invalidEmail"))
        .transform((value) => value.trim().toLowerCase()),
      password: z.string().min(8, t("validation.passwordMin8")),
      confirmPassword: z.string().min(1, t("validation.confirmPasswordRequired")),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t("validation.passwordsMismatch"),
      path: ["confirmPassword"],
    });
}

export function createVerifyCodeSchema(t: TranslateFn) {
  return z.object({
    code: z
      .string()
      .regex(/^\d{6}$/, t("validation.codeMin6")),
  });
}

export function createDetailsSchema(t: TranslateFn) {
  return z.object({
    name: z.string().min(2, t("validation.nameRequired")),
    phone: z
      .string()
      .min(1, t("validation.phoneRequired"))
      .refine((value) => isValidContactPhone(value), t("validation.phoneInvalid")),
  });
}

export function createForgotEmailSchema(t: TranslateFn) {
  return z.object({
    email: z
      .string()
      .email(t("validation.invalidEmail"))
      .transform((value) => value.trim().toLowerCase()),
  });
}

/** Step 2 of password reset: OTP + new password (verified together by the server). */
export function createResetPasswordSchema(t: TranslateFn) {
  return z
    .object({
      code: z.string().regex(/^\d{6}$/, t("validation.codeMin6")),
      newPassword: z.string().min(8, t("validation.passwordMin8")),
      confirmPassword: z.string().min(1, t("validation.confirmPasswordRequired")),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: t("validation.passwordsMismatch"),
      path: ["confirmPassword"],
    });
}

/** Nest link-token reset: new password only (token from URL). */
export function createTokenResetPasswordSchema(t: TranslateFn) {
  return z
    .object({
      newPassword: z.string().min(8, t("validation.passwordMin8")),
      confirmPassword: z.string().min(1, t("validation.confirmPasswordRequired")),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: t("validation.passwordsMismatch"),
      path: ["confirmPassword"],
    });
}

export function createChangePasswordSchema(t: TranslateFn) {
  return z
    .object({
      currentPassword: z.string().min(1, t("validation.currentPasswordRequired")),
      newPassword: z.string().min(8, t("validation.passwordMin8")),
      confirmPassword: z.string().min(1, t("validation.confirmPasswordRequired")),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: t("validation.passwordsMismatch"),
      path: ["confirmPassword"],
    });
}

export function createContactSchema(t: TranslateFn) {
  return z.object({
    name: z.string().min(2, t("validation.contactNameRequired")),
    email: z.string().email(t("validation.invalidEmail")),
    subject: z.string().min(3, t("validation.contactSubjectRequired")),
    message: z.string().min(10, t("validation.contactMessageMin")),
    /** Honeypot — must remain empty (Layer 2 app defense). */
    companyWebsite: z.string().optional(),
  });
}
