import type { AccountStatusEventType, Prisma } from "@prisma/client";
import { resolveDateRange } from "./date-range";

export type AdminDateField =
  | "registration"
  | "submission"
  | "approval"
  | "rejection"
  | "pause"
  | "resume"
  | "suspension"
  | "ban"
  | "unban"
  | "payment"
  | "last_active"
  | "event";

const EVENT_DATE_FIELDS: Record<string, AccountStatusEventType> = {
  approval: "approved",
  rejection: "rejected",
  pause: "paused",
  resume: "resumed",
  suspension: "suspended",
  ban: "banned",
  unban: "unbanned",
};

/** Map UI dateField + optional eventType into Prisma profile where fragments. */
export function buildAdminUserDateFilter(opts: {
  dateField?: string | null;
  eventType?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  preset?: string | null;
  timeZone?: string | null;
}): {
  profileWhere: Prisma.ProfileWhereInput;
  applied: Record<string, string | null>;
  from: Date | null;
  to: Date | null;
} {
  const dateField = (opts.dateField || "").trim() || null;
  const eventTypeRaw = (opts.eventType || "").trim() || null;

  let from: Date | null = null;
  let to: Date | null = null;
  if (opts.preset || opts.dateFrom || opts.dateTo) {
    try {
      const range = resolveDateRange({
        preset: opts.preset || (opts.dateFrom && opts.dateTo ? "custom" : "last_7_days"),
        from: opts.dateFrom,
        to: opts.dateTo,
        timeZone: opts.timeZone,
      });
      from = range.from;
      to = range.to;
    } catch {
      from = null;
      to = null;
    }
  }

  const applied = {
    dateField,
    eventType: eventTypeRaw,
    dateFrom: from?.toISOString() ?? null,
    dateTo: to?.toISOString() ?? null,
    timeZone: opts.timeZone ?? "UTC",
    preset: opts.preset ?? null,
  };

  if (!from || !to) {
    return { profileWhere: {}, applied, from, to };
  }

  const range = { gte: from, lt: to };

  // Explicit history event filter (clickable stats).
  if (eventTypeRaw || dateField === "event") {
    const eventType = (eventTypeRaw || "approved") as AccountStatusEventType;
    return {
      profileWhere: {
        accountStatusEvents: {
          some: {
            eventType,
            createdAt: range,
          },
        },
      },
      applied: { ...applied, eventType },
      from,
      to,
    };
  }

  // Date-field shortcuts that map to history events.
  if (dateField && EVENT_DATE_FIELDS[dateField]) {
    return {
      profileWhere: {
        accountStatusEvents: {
          some: {
            eventType: EVENT_DATE_FIELDS[dateField],
            createdAt: range,
          },
        },
      },
      applied,
      from,
      to,
    };
  }

  switch (dateField) {
    case "registration":
      return {
        profileWhere: { user: { createdAt: range } },
        applied,
        from,
        to,
      };
    case "submission":
      return {
        profileWhere: { submittedAt: range },
        applied,
        from,
        to,
      };
    case "payment":
      return {
        profileWhere: {
          user: {
            payments: {
              some: {
                status: "completed",
                OR: [
                  { fulfilledAt: range },
                  { paymentCreatedAt: range },
                ],
              },
            },
          },
        },
        applied,
        from,
        to,
      };
    case "last_active":
      return {
        profileWhere: { user: { lastActiveAt: range } },
        applied,
        from,
        to,
      };
    case "approval":
      return {
        profileWhere: {
          OR: [
            { approvedAt: range },
            {
              accountStatusEvents: {
                some: { eventType: "approved", createdAt: range },
              },
            },
          ],
        },
        applied,
        from,
        to,
      };
    case "rejection":
      return {
        profileWhere: {
          OR: [
            { rejectedAt: range },
            {
              accountStatusEvents: {
                some: { eventType: "rejected", createdAt: range },
              },
            },
          ],
        },
        applied,
        from,
        to,
      };
    default:
      // No date field → still allow preset range on registration by default for review queue.
      if (opts.preset) {
        return {
          profileWhere: { user: { createdAt: range } },
          applied: { ...applied, dateField: "registration" },
          from,
          to,
        };
      }
      return { profileWhere: {}, applied, from, to };
  }
}
