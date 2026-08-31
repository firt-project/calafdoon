import type { MemberReminderId } from "@/types";
import type { TranslationPath } from "@/lib/i18n/translations";

export const reminderCopy: Record<
  MemberReminderId,
  { title: TranslationPath; body: TranslationPath; action: TranslationPath }
> = {
  "complete-profile": {
    title: "reminders.completeProfileTitle",
    body: "reminders.completeProfileBody",
    action: "reminders.completeProfileAction",
  },
  "complete-payment": {
    title: "reminders.completePaymentTitle",
    body: "reminders.completePaymentBody",
    action: "reminders.completePaymentAction",
  },
  "free-trial-active": {
    title: "reminders.freeTrialTitle",
    body: "reminders.freeTrialBody",
    action: "reminders.freeTrialAction",
  },
  "pending-approval": {
    title: "reminders.pendingApprovalTitle",
    body: "reminders.pendingApprovalBody",
    action: "reminders.pendingApprovalAction",
  },
  "browse-matches": {
    title: "reminders.browseMatchesTitle",
    body: "reminders.browseMatchesBody",
    action: "reminders.browseMatchesAction",
  },
};
