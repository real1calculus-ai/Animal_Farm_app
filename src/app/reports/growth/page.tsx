import Link from "next/link";

import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { ReportShell, ReportSection } from "@/components/reports/report-shell";
import { resolveDateRange } from "@/components/reports/date-range";
import { BarChart, BAD } from "@/components/charts";
import { requireUser } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { growthRows, mortalityByPen, feedEfficiency } from "@/lib/db/reports";
import { formatKg, formatPercent } from "@/lib/format";

export default async function GrowthReportPage({ searchParams }: PageProps<"/reports/growth">) {
  const user = await requireUser();
  const farmId = await getActiveFarmId(user);
  const range = resolveDateRange(await searchParams);

  const [rows, mortality, efficiency] = await Promise.all([
    growthRows(farmId, range),
    mortalityByPen(farmId, range),
    feedEfficiency(farmId, range),
  ]);

  const measurable = rows.filter((row) => row.adgKgPerDay !== null);
  const herdAdg =
    measurable.length > 0
      ? measurable.reduce((sum, row) => sum + (row.adgKgPerDay ?? 0), 0) / measurable.length
      : null;

  // "Slow" is judged against this herd's own median, not a textbook figure: a
  // heritage breed on pasture is legitimately slower than a commercial cross,
  // and a fixed benchmark would flag every animal on such a farm.
  const sortedAdg = measurable
    .map((row) => row.adgKgPerDay ?? 0)
    .sort((a, b) => a - b);
  const median =
    sortedAdg.length > 0 ? sortedAdg[Math.floor(sortedAdg.length / 2)] : null;
  const slowThreshold = median === null ? null : median * 0.75;

  const byPen = new Map<string, { total: number; count: number }>();
  for (const row of measurable) {
    const key = row.penName ?? "No pen";
    const entry = byPen.get(key) ?? { total: 0, count: 0 };
    entry.total += row.adgKgPerDay ?? 0;
    entry.count += 1;
    byPen.set(key, entry);
  }

  const slow =
    slowThreshold === null
      ? []
      : measurable
          .filter((row) => (row.adgKgPerDay ?? 0) < slowThreshold)
          .sort((a, b) => (a.adgKgPerDay ?? 0) - (b.adgKgPerDay ?? 0));

  return (
    <ReportShell
      title="Growth performance"
      decision="Whether animals are reaching weight on schedule, and which pens are lagging."
      path="/reports/growth"
      range={range}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Animals weighed"
          value={String(rows.length)}
          hint={`${measurable.length} with two or more weigh-ins`}
        />
        <StatTile
          label="Average daily gain"
          value={herdAdg === null ? "—" : `${herdAdg.toFixed(2)} kg/day`}
        />
        <StatTile
          label="Feed conversion"
          value={efficiency.fcr === null ? "—" : efficiency.fcr.toFixed(2)}
          hint="kg feed per kg gain — lower is better"
        />
        <StatTile
          label="Slow growers"
          value={String(slow.length)}
          hint="Below 75% of this herd's median gain"
        />
      </div>

      <ReportSection
        title="Average daily gain by pen"
        description="Animals with at least two weigh-ins inside the period."
      >
        <BarChart
          title=""
          data={[...byPen.entries()].map(([label, entry]) => ({
            label,
            value: entry.total / entry.count,
            hint: `${entry.count} animal${entry.count === 1 ? "" : "s"}`,
          }))}
          formatValue={(value) => `${value.toFixed(2)} kg/day`}
          emptyMessage="No weigh-in pairs in this period."
        />
      </ReportSection>

      <ReportSection
        title="Slow growers"
        description="Worth checking for health, parasites or competition at the feeder before assuming genetics."
      >
        {slow.length === 0 ? (
          <EmptyState title="No animal is growing markedly below the herd median" />
        ) : (
          <Card className="p-0">
            <Table>
              <Thead>
                <Tr>
                  <Th>Tag</Th>
                  <Th>Breed</Th>
                  <Th>Pen</Th>
                  <Th className="text-right">Age</Th>
                  <Th className="text-right">Weight</Th>
                  <Th className="text-right">Daily gain</Th>
                </Tr>
              </Thead>
              <Tbody>
                {slow.map((row) => (
                  <Tr key={row.pigId}>
                    <Td>
                      <Link href={`/animals/${row.pigId}`} className="underline underline-offset-2">
                        {row.tagNumber}
                      </Link>
                    </Td>
                    <Td>{row.breed}</Td>
                    <Td>{row.penName ?? "—"}</Td>
                    <Td className="text-right tabular-nums">{row.ageDays} d</Td>
                    <Td className="text-right tabular-nums">{formatKg(row.latestWeightKg)}</Td>
                    <Td className="text-right tabular-nums text-red-700 dark:text-red-400">
                      {(row.adgKgPerDay ?? 0).toFixed(2)} kg/day
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Card>
        )}
      </ReportSection>

      <ReportSection title="Mortality by pen">
        <BarChart
          title=""
          data={mortality.map((row) => ({
            label: row.label,
            value: row.deaths,
            hint: row.rate === null ? undefined : formatPercent(row.rate, 1),
            color: BAD,
          }))}
          formatValue={(value) => String(Math.round(value))}
          emptyMessage="No deaths recorded in this period."
        />
      </ReportSection>
    </ReportShell>
  );
}
