import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { CalendarMonth } from "@/components/breeding/calendar-month";
import { DueCountdown } from "@/components/breeding/status-badge";
import { firstParam } from "@/components/breeding/search-params";
import { requireUser } from "@/lib/auth";
import { getActiveFarmId, getFarmSettings } from "@/lib/active-farm";
import { ageInDays, formatAge, formatDate, formatKg } from "@/lib/format";
import {
  getBreedingAttention,
  listCalendarEvents,
  type BreedingListRow,
} from "@/lib/db/breeding";

/**
 * Breeding calendar: matings, expected and actual farrowings, and weaning
 * dates, plus the "attention now" panel.
 *
 * The panel sits *above* the grid deliberately. A month view is how you plan
 * next week; the four lists below are what is already going wrong today, and a
 * farm that only ever reads the calendar will still see them.
 */
export default async function BreedingCalendarPage({
  searchParams,
}: PageProps<"/breeding/calendar">) {
  const user = await requireUser();
  const farmId = await getActiveFarmId(user);
  const settings = await getFarmSettings(farmId);

  const params = await searchParams;
  const month = parseMonth(firstParam(params.month));

  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59, 999);

  const [events, attention] = await Promise.all([
    listCalendarEvents(farmId, monthStart, monthEnd, settings),
    getBreedingAttention(farmId, settings),
  ]);

  const previous = monthKey(new Date(month.getFullYear(), month.getMonth() - 1, 1));
  const next = monthKey(new Date(month.getFullYear(), month.getMonth() + 1, 1));
  const title = monthStart.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const nothingNeedsAttention =
    attention.overdue.length === 0 &&
    attention.dueThisWeek.length === 0 &&
    attention.unconfirmed.length === 0 &&
    attention.readyGilts.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Breeding calendar"
        description={`Gestation ${settings.gestationDays} days · weaning at ${settings.weaningAgeDays} days · estrus cycle ${settings.estrusCycleDays} days`}
        actions={
          <>
            <ButtonLink href="/breeding" variant="secondary">
              Breeding records
            </ButtonLink>
            <ButtonLink href="/breeding/new">Record mating</ButtonLink>
          </>
        }
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Attention now</h2>

        {nothingNeedsAttention ? (
          <Card>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Nothing overdue, nothing due this week, every mating confirmed, and no gilt waiting on
              her first service.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <AttentionCard
              title={`Overdue farrowings (${attention.overdue.length})`}
              description={`Past the expected date by more than the farm's ${settings.gestationToleranceDays}-day tolerance.`}
              tone="danger"
              rows={attention.overdue}
              toleranceDays={settings.gestationToleranceDays}
              emptyText="No animal is past her date."
            />
            <AttentionCard
              title={`Farrowing in the next 7 days (${attention.dueThisWeek.length})`}
              description="Move them to birthing pens and start monitoring."
              tone="warning"
              rows={attention.dueThisWeek}
              toleranceDays={settings.gestationToleranceDays}
              emptyText="Nothing due this week."
            />
            <AttentionCard
              title={`Awaiting pregnancy confirmation (${attention.unconfirmed.length})`}
              description={`Mated more than ${settings.estrusCycleDays} days ago — long enough to have returned to heat, so they should have been checked by now.`}
              tone="warning"
              rows={attention.unconfirmed}
              toleranceDays={settings.gestationToleranceDays}
              emptyText="Every mating has an outcome recorded."
            />

            <Card className="space-y-3">
              <div>
                <h3 className="font-medium text-zinc-900 dark:text-zinc-50">
                  Gilts ready for first service ({attention.readyGilts.length})
                </h3>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  At or above {settings.minBreedingAgeDaysFemale} days and{" "}
                  {settings.minBreedingWeightKg} kg, never bred.
                </p>
              </div>
              {attention.readyGilts.length === 0 ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No gilt is waiting on her first service.
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {attention.readyGilts.map((gilt) => (
                    <li key={gilt.id} className="flex flex-wrap items-baseline justify-between gap-2">
                      <Link href={`/animals/${gilt.id}`} className="font-medium hover:underline">
                        {gilt.tagNumber}
                        {gilt.name ? ` — ${gilt.name}` : ""}
                      </Link>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {formatAge(gilt.dateOfBirth)} · {formatKg(gilt.currentWeightKg)} ·{" "}
                        {ageInDays(gilt.dateOfBirth)} days
                      </span>
                      <Link
                        href={`/breeding/match-finder?damId=${gilt.id}`}
                        className="text-xs underline"
                      >
                        Find a match
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
      </section>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
          <div className="flex items-center gap-2 text-sm">
            <Link
              href={`/breeding/calendar?month=${previous}`}
              className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              ← Previous
            </Link>
            <Link
              href="/breeding/calendar"
              className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              This month
            </Link>
            <Link
              href={`/breeding/calendar?month=${next}`}
              className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Next →
            </Link>
          </div>
        </div>

        {events.length === 0 ? (
          <EmptyState
            title={`Nothing scheduled in ${title}`}
            description="Matings, births and weanings all appear here once a breeding is recorded."
            action={<ButtonLink href="/breeding/new">Record mating</ButtonLink>}
          />
        ) : (
          <CalendarMonth month={monthStart} events={events} />
        )}
      </Card>
    </div>
  );
}

function AttentionCard({
  title,
  description,
  tone,
  rows,
  toleranceDays,
  emptyText,
}: {
  title: string;
  description: string;
  tone: "danger" | "warning";
  rows: BreedingListRow[];
  toleranceDays: number;
  emptyText: string;
}) {
  const border =
    tone === "danger"
      ? "border-red-300 dark:border-red-900"
      : "border-amber-300 dark:border-amber-900";

  return (
    <Card className={`space-y-3 ${rows.length > 0 ? border : ""}`}>
      <div>
        <h3 className="font-medium text-zinc-900 dark:text-zinc-50">{title}</h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{emptyText}</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-2">
              <Link href={`/breeding/${row.id}`} className="font-medium hover:underline">
                {row.dam.tagNumber} × {row.sire.tagNumber}
              </Link>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                bred {formatDate(row.breedingDate)} · due {formatDate(row.expectedFarrowingDate)}
              </span>
              <DueCountdown
                expectedFarrowingDate={row.expectedFarrowingDate}
                status={row.pregnancyStatus}
                toleranceDays={toleranceDays}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** `?month=YYYY-MM`, falling back to the current month on anything unparseable. */
function parseMonth(raw: string | null): Date {
  if (raw) {
    const match = /^(\d{4})-(\d{2})$/.exec(raw);
    if (match) {
      const year = Number.parseInt(match[1], 10);
      const monthIndex = Number.parseInt(match[2], 10) - 1;
      if (monthIndex >= 0 && monthIndex <= 11) return new Date(year, monthIndex, 1);
    }
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
