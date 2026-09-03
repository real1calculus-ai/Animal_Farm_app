import Link from "next/link";

import type { CalendarEvent, CalendarEventKind } from "@/lib/db/breeding";

/**
 * Month view, built from CSS grid — no calendar dependency.
 *
 * Weeks start on Monday, which is how a farm week is planned, and each day cell
 * is a fixed-height scroll box so one busy day cannot stretch the whole row and
 * push the rest of the month off a phone screen.
 */

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const KIND_STYLES: Record<CalendarEventKind, { chip: string; label: string }> = {
  MATING: {
    chip: "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300",
    label: "Mated",
  },
  EXPECTED_FARROWING: {
    chip: "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300",
    label: "Due",
  },
  ACTUAL_FARROWING: {
    chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
    label: "Farrowed",
  },
  EXPECTED_WEANING: {
    chip: "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300",
    label: "Weaning",
  },
};

const OVERDUE_CHIP = "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300";

export function CalendarMonth({
  month,
  events,
  today = new Date(),
}: {
  /** Any date inside the month to render. */
  month: Date;
  events: CalendarEvent[];
  today?: Date;
}) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  // getDay() is Sunday-first; shift so Monday is column 0.
  const leadingBlanks = (new Date(year, monthIndex, 1).getDay() + 6) % 7;

  const byDay = new Map<number, CalendarEvent[]>();
  for (const event of events) {
    if (event.date.getFullYear() !== year || event.date.getMonth() !== monthIndex) continue;
    const day = event.date.getDate();
    byDay.set(day, [...(byDay.get(day) ?? []), event]);
  }

  const isThisMonth =
    today.getFullYear() === year && today.getMonth() === monthIndex;

  return (
    <div>
      <div className="grid grid-cols-7 gap-px border-b border-zinc-200 pb-1 text-center text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        {WEEKDAYS.map((day) => (
          <div key={day} className="py-1">
            <span className="hidden sm:inline">{day}</span>
            <span className="sm:hidden">{day.charAt(0)}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-zinc-200 dark:bg-zinc-800">
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <div key={`blank-${i}`} className="min-h-24 bg-zinc-50 dark:bg-zinc-950" />
        ))}

        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const dayEvents = byDay.get(day) ?? [];
          const isToday = isThisMonth && today.getDate() === day;

          return (
            <div
              key={day}
              className={`min-h-24 overflow-y-auto bg-white p-1 dark:bg-zinc-900 ${
                isToday ? "ring-2 ring-inset ring-zinc-900 dark:ring-zinc-100" : ""
              }`}
            >
              <div
                className={`mb-1 text-right text-xs ${
                  isToday
                    ? "font-semibold text-zinc-900 dark:text-zinc-50"
                    : "text-zinc-400 dark:text-zinc-500"
                }`}
              >
                {day}
              </div>
              <ul className="space-y-0.5">
                {dayEvents.map((event, index) => (
                  <li key={`${event.breedingRecordId}-${event.kind}-${index}`}>
                    <Link
                      href={`/breeding/${event.breedingRecordId}`}
                      title={`${event.detail} — ${event.damTag} × ${event.sireTag}`}
                      className={`block truncate rounded px-1 py-0.5 text-[11px] leading-tight ${
                        event.overdue ? OVERDUE_CHIP : KIND_STYLES[event.kind].chip
                      }`}
                    >
                      <span className="font-medium">
                        {event.overdue ? "OVERDUE" : KIND_STYLES[event.kind].label}
                      </span>{" "}
                      {event.damTag}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
        {(Object.keys(KIND_STYLES) as CalendarEventKind[]).map((kind) => (
          <li key={kind} className="flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded ${KIND_STYLES[kind].chip}`} aria-hidden="true" />
            {KIND_STYLES[kind].label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className={`h-3 w-3 rounded ${OVERDUE_CHIP}`} aria-hidden="true" />
          Overdue farrowing
        </li>
      </ul>
    </div>
  );
}
