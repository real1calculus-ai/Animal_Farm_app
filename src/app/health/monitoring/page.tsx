import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { BarChart, LineChart, BAD, GOOD, NEUTRAL } from "@/components/charts";
import { OutbreakAlerts } from "@/components/health/outbreak-alerts";
import { requireUser } from "@/lib/auth";
import { getActiveFarmId, getFarmSettings } from "@/lib/active-farm";
import { formatCents, formatDate, formatPercent } from "@/lib/format";
import { HEALTH_CATEGORY_LABELS } from "@/lib/labels";
import {
  getAntibioticUsage,
  getDiseaseTimeline,
  getMorbidity,
  getMortalityReport,
  getOutbreakReport,
  getTreatmentCostByCategory,
} from "@/lib/db/health";

/** A pen this far above the herd rate is worth looking at, not just reading. */
const PEN_OUTLIER_MULTIPLE = 1.5;

/**
 * The disease dashboard (§3.2).
 *
 * Everything here answers "is something going wrong right now, and where" —
 * which is why the pen breakdown appears next to every herd-level number. A
 * herd morbidity rate of 4% is unremarkable until you see that all of it is in
 * one nursery pen.
 */
export default async function MonitoringPage() {
  const user = await requireUser();
  const farmId = await getActiveFarmId(user);
  const settings = await getFarmSettings(farmId);

  const [morbidity, mortality, timeline, antibiotics, outbreak, costs] = await Promise.all([
    getMorbidity(farmId),
    getMortalityReport(farmId),
    getDiseaseTimeline(farmId),
    getAntibioticUsage(farmId),
    getOutbreakReport(farmId),
    getTreatmentCostByCategory(farmId),
  ]);

  const alertCount = outbreak.alerts.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Disease monitoring"
        description={`Morbidity, mortality, outbreak clusters and antibiotic usage. An outbreak is ${settings.outbreakCaseThreshold} or more animals with the same condition inside ${settings.outbreakWindowDays} days.`}
        actions={
          <>
            <ButtonLink href="/health" variant="secondary">
              Health records
            </ButtonLink>
            <ButtonLink href="/health/vaccinations" variant="secondary">
              Vaccinations
            </ButtonLink>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Morbidity rate"
          value={formatPercent(morbidity.rate)}
          hint={`${morbidity.sickCount} of ${morbidity.herdCount} active animals`}
        />
        <StatTile
          label="Active outbreak alerts"
          value={String(alertCount)}
          hint={
            alertCount > 0
              ? "Isolation advice below"
              : `Below the ${settings.outbreakCaseThreshold}-animal threshold`
          }
        />
        <StatTile
          label={`Deaths, last ${mortality.spike.windowDays} days`}
          value={String(mortality.spike.recentDeaths)}
          hint={mortality.spike.flagged ? "Sudden increase flagged" : "Within the normal range"}
        />
        <StatTile
          label="Antibiotic courses"
          value={String(antibiotics.totalCourses)}
          hint={`${antibiotics.totalAnimals} animals, last 6 months`}
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Outbreak alerts</h2>
        <OutbreakAlerts
          alerts={outbreak.alerts}
          caseThreshold={outbreak.caseThreshold}
          windowDays={outbreak.windowDays}
        />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <BarChart
            title="Morbidity by pen"
            description="Share of each pen's active animals carrying an ongoing condition. A pen well above the herd rate is where to look first."
            data={morbidity.byPen.map((pen) => ({
              label: pen.penName,
              value: pen.rate,
              hint: `${pen.sickCount}/${pen.herdCount}`,
              color:
                morbidity.rate > 0 && pen.rate >= morbidity.rate * PEN_OUTLIER_MULTIPLE
                  ? BAD
                  : pen.rate === 0
                    ? GOOD
                    : NEUTRAL,
            }))}
            max={1}
            formatValue={(value) => formatPercent(value, 1)}
            emptyMessage="No active animals recorded yet."
            footnote={`Herd rate ${formatPercent(morbidity.rate)}. Pens at or above ${PEN_OUTLIER_MULTIPLE}× that are shown in red.`}
          />
        </Card>

        <Card>
          <BarChart
            title="Treatment cost by category"
            description="Record cost plus the medications on it, over the last 12 months."
            data={costs.rows.map((row) => ({
              label: HEALTH_CATEGORY_LABELS[row.category],
              value: row.totalCents,
              hint: `${row.animalCount} animals`,
            }))}
            formatValue={(value) => formatCents(value)}
            emptyMessage="No treatment costs recorded in the last 12 months."
            footnote={`Total ${formatCents(costs.totalCents)}.`}
          />
        </Card>
      </div>

      <Card>
        <LineChart
          title="Disease timeline"
          description="Distinct animals affected by each condition, per week. Counting animals rather than records keeps one pig's three follow-up visits from looking like an outbreak."
          series={timeline.series.map((serie) => ({
            name: serie.diagnosis,
            points: timeline.buckets.map((bucket, index) => ({
              label: bucket.label,
              value: serie.counts[index] ?? 0,
            })),
          }))}
          yZero
          formatValue={(value) => value.toFixed(0)}
          emptyMessage="No health records in the last 12 weeks."
          footnote="The six conditions affecting the most animals over the period."
        />
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <LineChart
            title="Antibiotic usage"
            description="Courses started and animals treated per month — the resistance-monitoring measure in §3.2. The two lines diverging means repeat courses on the same animals."
            series={[
              {
                name: "Courses",
                points: antibiotics.points.map((point) => ({
                  label: point.label,
                  value: point.courses,
                })),
              },
              {
                name: "Animals treated",
                points: antibiotics.points.map((point) => ({
                  label: point.label,
                  value: point.animals,
                })),
              },
            ]}
            yZero
            formatValue={(value) => value.toFixed(0)}
            emptyMessage="No medications recorded in the last 6 months."
            footnote={`${formatPercent(antibiotics.shareOfAllMedications)} of all medication courses in the period were antibiotics.`}
          />
        </Card>

        <Card>
          <BarChart
            title="Antibiotics by drug"
            description="Which products the herd is actually exposed to."
            data={antibiotics.topDrugs.map((drug) => ({
              label: drug.drugName,
              value: drug.courses,
              hint: `${drug.animals} animals`,
            }))}
            formatValue={(value) => `${value} course${value === 1 ? "" : "s"}`}
            emptyMessage="No antibiotic courses recorded in the last 6 months."
          />
        </Card>
      </div>

      <Card
        className={
          mortality.spike.flagged
            ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
            : undefined
        }
      >
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Mortality events</h2>
        {mortality.spike.flagged ? (
          <p
            role="alert"
            className="mt-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-red-800 ring-1 ring-red-200 dark:bg-zinc-900 dark:text-red-300 dark:ring-red-900"
          >
            Sudden increase in mortality. {mortality.spike.reason} Investigate before treating
            individuals: a step change usually points at feed, water, ventilation or a new arrival
            rather than at the animals that died.
          </p>
        ) : (
          <p className="mt-1 mb-3 text-xs text-zinc-600 dark:text-zinc-400">
            {mortality.spike.recentDeaths} deaths in the last {mortality.spike.windowDays} days
            against a baseline of {mortality.spike.baselineAverage.toFixed(1)} over the preceding{" "}
            {mortality.spike.baselineWindowDays} days. No sudden increase.
          </p>
        )}

        {mortality.events.length === 0 ? (
          <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">
            No deaths recorded in the last 180 days.
          </p>
        ) : (
          <div className="mt-3">
            <Table>
              <Thead>
                <Tr>
                  <Th>Date</Th>
                  <Th>Animal</Th>
                  <Th>Pen</Th>
                  <Th>Diagnosis</Th>
                  <Th>Record</Th>
                </Tr>
              </Thead>
              <Tbody>
                {mortality.events.map((event) => (
                  <Tr key={`${event.pigId}-${event.date.toISOString()}`}>
                    <Td className="whitespace-nowrap">{formatDate(event.date)}</Td>
                    <Td>
                      <Link
                        href={`/animals/${event.pigId}`}
                        className="font-medium underline underline-offset-2"
                      >
                        {event.tagNumber}
                      </Link>
                    </Td>
                    <Td>{event.penName ?? "—"}</Td>
                    <Td>
                      {event.diagnosis ?? (
                        <span className="text-zinc-500 dark:text-zinc-400">
                          No health record — cause not recorded
                        </span>
                      )}
                    </Td>
                    <Td>
                      {event.healthRecordId ? (
                        <Link
                          href={`/health/${event.healthRecordId}`}
                          className="underline underline-offset-2"
                        >
                          View
                        </Link>
                      ) : (
                        "—"
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
