/**
 * Parse admin date-range presets into UTC [from, to) bounds.
 * Display timezone is for labeling only — storage remains UTC.
 */

export type DatePreset =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_year"
  | "all_time"
  | "custom";

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)
  );
}

function addUtcDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** Shift a UTC instant into a timezone's wall-clock components via Intl. */
function zonedParts(
  date: Date,
  timeZone: string
): { y: number; m: number; d: number; h: number; min: number; s: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value])
  );
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    h: Number(parts.hour),
    min: Number(parts.minute),
    s: Number(parts.second),
  };
}

/** Approximate: construct UTC instant for a local wall time in `timeZone`. */
export function zonedLocalToUtc(
  timeZone: string,
  y: number,
  m: number,
  d: number,
  h = 0,
  min = 0,
  s = 0
): Date {
  // Initial guess as UTC, then correct by offset observed in that zone.
  let guess = Date.UTC(y, m - 1, d, h, min, s);
  for (let i = 0; i < 3; i++) {
    const parts = zonedParts(new Date(guess), timeZone);
    const asUtc = Date.UTC(
      parts.y,
      parts.m - 1,
      parts.d,
      parts.h,
      parts.min,
      parts.s
    );
    const desired = Date.UTC(y, m - 1, d, h, min, s);
    guess += desired - asUtc;
  }
  return new Date(guess);
}

export function resolveDateRange(opts: {
  preset?: string | null;
  from?: string | null;
  to?: string | null;
  /** IANA timezone for preset calendar days. Default UTC. */
  timeZone?: string | null;
  now?: Date;
}): { from: Date; to: Date; preset: string; timeZone: string } {
  const now = opts.now ?? new Date();
  const timeZone = opts.timeZone?.trim() || "UTC";
  const preset = (opts.preset || "last_7_days") as DatePreset;

  if (preset === "custom" || (opts.from && opts.to)) {
    const from = opts.from ? new Date(opts.from) : startOfUtcDay(now);
    const to = opts.to ? new Date(opts.to) : addUtcDays(startOfUtcDay(now), 1);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new Error("Invalid custom date range");
    }
    if (to <= from) throw new Error("End must be after start");
    return { from, to, preset: "custom", timeZone };
  }

  if (preset === "all_time") {
    return {
      from: new Date("2020-01-01T00:00:00.000Z"),
      to: addUtcDays(now, 1),
      preset,
      timeZone,
    };
  }

  const parts = zonedParts(now, timeZone);

  const dayStart = (y: number, m: number, d: number) =>
    zonedLocalToUtc(timeZone, y, m, d, 0, 0, 0);

  const todayStart = dayStart(parts.y, parts.m, parts.d);
  const tomorrowStart = addUtcDays(todayStart, 1);

  switch (preset) {
    case "today":
      return { from: todayStart, to: tomorrowStart, preset, timeZone };
    case "yesterday": {
      const yStart = addUtcDays(todayStart, -1);
      return { from: yStart, to: todayStart, preset, timeZone };
    }
    case "last_7_days":
      return {
        from: addUtcDays(todayStart, -6),
        to: tomorrowStart,
        preset,
        timeZone,
      };
    case "last_30_days":
      return {
        from: addUtcDays(todayStart, -29),
        to: tomorrowStart,
        preset,
        timeZone,
      };
    case "this_week": {
      // Monday-start in local zone
      const dow = new Date(
        Date.UTC(parts.y, parts.m - 1, parts.d)
      ).getUTCDay();
      const mondayOffset = (dow + 6) % 7;
      const weekStart = addUtcDays(todayStart, -mondayOffset);
      return { from: weekStart, to: tomorrowStart, preset, timeZone };
    }
    case "last_week": {
      const dow = new Date(
        Date.UTC(parts.y, parts.m - 1, parts.d)
      ).getUTCDay();
      const mondayOffset = (dow + 6) % 7;
      const thisWeekStart = addUtcDays(todayStart, -mondayOffset);
      return {
        from: addUtcDays(thisWeekStart, -7),
        to: thisWeekStart,
        preset,
        timeZone,
      };
    }
    case "this_month":
      return {
        from: dayStart(parts.y, parts.m, 1),
        to: tomorrowStart,
        preset,
        timeZone,
      };
    case "last_month": {
      const firstThis = dayStart(parts.y, parts.m, 1);
      const firstLast =
        parts.m === 1
          ? dayStart(parts.y - 1, 12, 1)
          : dayStart(parts.y, parts.m - 1, 1);
      return { from: firstLast, to: firstThis, preset, timeZone };
    }
    case "this_year":
      return {
        from: dayStart(parts.y, 1, 1),
        to: tomorrowStart,
        preset,
        timeZone,
      };
    default:
      return {
        from: addUtcDays(todayStart, -6),
        to: tomorrowStart,
        preset: "last_7_days",
        timeZone,
      };
  }
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function previousPeriod(from: Date, to: Date): { from: Date; to: Date } {
  const ms = to.getTime() - from.getTime();
  return { from: new Date(from.getTime() - ms), to: new Date(from.getTime()) };
}
