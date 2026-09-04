import Link from "next/link";

import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { ReportShell, ReportSection } from "@/components/reports/report-shell";
import { resolveDateRange } from "@/components/reports/date-range";
import { LineChart } from "@/components/charts";
import { requireUser } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import {
  conceptionByDam,
  conceptionBySire,
  litterSizeTrend,
  litterStats,
  sowProductivity,
} from "@/lib/db/reports";
import { formatPercent } from "@/lib/format";
import type { ConceptionRow } from "@/lib/db/reports";

function ConceptionTable({ rows, label }: { rows: ConceptionRow[]; label: string }) {
  if (rows.length === 0) {
    return <EmptyState title={`No settled matings for any ${label} in this period`} />;
  }

  return (
    <Card className="p-0">
      <Table>
        <Thead>
          <Tr>
            <Th>{label}</Th>
            <Th className="text-right">Matings</Th>
            <Th className="text-right">Conceived</Th>
            <Th className="text-right">Rate</Th>
          </Tr>
        </Thead>
        <Tbody>
          {rows.map((row) => (
            <Tr key={row.id}>
              <Td>
                <Link href={`/animals/${row.id}`} className="underline underline-offset-2">
                  {row.tagNumber}
                </Link>
                {row.name ? (
                  <span className="ml-1 text-xs text-zinc-500 dark:text-zinc-400">{row.name}</span>
                ) : null}
              </Td>
              <Td className="text-right tabular-nums">{row.matings}</Td>
              <Td className="text-right tabular-nums">{row.conceived}</Td>
              <Td className="text-right tabular-nums">
                {row.rate === null ? (
                  <span className="text-zinc-400" title="Fewer than three settled outcomes">
                    too few
                  </span>
                ) : (
                  formatPercent(row.rate, 0)
                )}
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </Card>
  );
}

export default async function BreedingReportPage({ searchParams }: PageProps<"/reports/breeding">) {
  const user = await requireUser();
  const farmId = await getActiveFarmId(user);
  const range = resolveDateRange(await searchParams);

  const [stats, trend, sires, dams, sows] = await Promise.all([
    litterStats(farmId, range),
    litterSizeTrend(farmId, range),
    conceptionBySire(farmId, range),
    conceptionByDam(farmId, range),
    sowProductivity(farmId),
  ]);

  return (
    <ReportShell
      title="Breeding performance"
      decision="Which sows and boars are earning their feed, and whether litter quality is holding."
      path="/reports/breeding"
      range={range}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Litters farrowed"
          value={String(stats.litters)}
          hint={`${stats.totalBornAlive} born alive`}
        />
        <StatTile
          label="Average litter"
          value={stats.avgBornAlive === null ? "—" : stats.avgBornAlive.toFixed(1)}
          hint="Born alive per litter"
        />
        <StatTile
          label="Stillbirth rate"
          value={formatPercent(stats.stillbirthRate)}
          hint={`${stats.totalStillborn} stillborn, ${stats.totalMummified} mummified`}
        />
        <StatTile
          label="Pre-weaning mortality"
          value={formatPercent(stats.preWeaningMortality)}
          hint="Litters that reached weaning only"
        />
      </div>

      <ReportSection
        title="Litter size trend"
        description="Average born alive per farrowing. Gaps are periods with no farrowings, not zeroes."
      >
        <LineChart
          title=""
          series={[
            {
              name: "Born alive",
              points: trend.buckets.map((bucket, i) => ({
                label: bucket.label,
                value: trend.values[i],
              })),
            },
          ]}
          formatValue={(value) => value.toFixed(1)}
          emptyMessage="No farrowings in this period."
        />
      </ReportSection>

      <ReportSection
        title="Conception rate by boar"
        description="A rate is only shown once a boar has three settled matings — below that it is noise."
      >
        <ConceptionTable rows={sires} label="Boar" />
      </ReportSection>

      <ReportSection title="Conception rate by sow">
        <ConceptionTable rows={dams} label="Sow" />
      </ReportSection>

      <ReportSection
        title="Sow productivity"
        description="Lifetime figures, not limited to the selected period — a sow's record is her whole career."
      >
        {sows.length === 0 ? (
          <EmptyState title="No sow has farrowed yet" />
        ) : (
          <Card className="p-0">
            <Table>
              <Thead>
                <Tr>
                  <Th>Sow</Th>
                  <Th className="text-right">Parity</Th>
                  <Th className="text-right">Lifetime born</Th>
                  <Th className="text-right">Lifetime weaned</Th>
                  <Th className="text-right">Avg litter</Th>
                  <Th className="text-right">Farrowing interval</Th>
                </Tr>
              </Thead>
              <Tbody>
                {sows.map((sow) => (
                  <Tr key={sow.id}>
                    <Td>
                      <Link href={`/animals/${sow.id}`} className="underline underline-offset-2">
                        {sow.tagNumber}
                      </Link>
                    </Td>
                    <Td className="text-right tabular-nums">{sow.parity}</Td>
                    <Td className="text-right tabular-nums">{sow.totalBornAlive}</Td>
                    <Td className="text-right tabular-nums">{sow.totalWeaned}</Td>
                    <Td className="text-right tabular-nums">
                      {sow.avgBornAlive === null ? "—" : sow.avgBornAlive.toFixed(1)}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {sow.farrowingIntervalDays === null
                        ? "—"
                        : `${Math.round(sow.farrowingIntervalDays)} d`}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Card>
        )}
      </ReportSection>
    </ReportShell>
  );
}
