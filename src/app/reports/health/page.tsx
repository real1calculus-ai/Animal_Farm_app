import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { ReportShell, ReportSection } from "@/components/reports/report-shell";
import { resolveDateRange } from "@/components/reports/date-range";
import { BarChart, LineChart } from "@/components/charts";
import { requireUser } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { antibioticUsage, diseasePrevalence, treatmentCostByCategory } from "@/lib/db/reports";
import { HEALTH_CATEGORY_LABELS } from "@/lib/labels";
import { formatCents } from "@/lib/format";
import type { HealthCategory } from "@prisma/client";

export default async function HealthReportPage({ searchParams }: PageProps<"/reports/health">) {
  const user = await requireUser();
  const farmId = await getActiveFarmId(user);
  const range = resolveDateRange(await searchParams);

  const [prevalence, antibiotics, costs] = await Promise.all([
    diseasePrevalence(farmId, range),
    antibioticUsage(farmId, range),
    treatmentCostByCategory(farmId, range),
  ]);

  const totalCostCents = costs.reduce((sum, row) => sum + row.costCents, 0);
  const totalCases = costs.reduce((sum, row) => sum + row.cases, 0);

  return (
    <ReportShell
      title="Health & antibiotics"
      decision="What is making animals sick, what it costs, and whether antibiotic use is falling."
      path="/reports/health"
      range={range}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Health records" value={String(totalCases)} />
        <StatTile label="Treatment cost" value={formatCents(totalCostCents)} />
        <StatTile
          label="Antibiotic courses"
          value={String(antibiotics.totalCourses)}
          hint={`${antibiotics.totalAnimals} animals treated`}
        />
        <StatTile
          label="Cost per case"
          value={totalCases > 0 ? formatCents(Math.round(totalCostCents / totalCases)) : "—"}
        />
      </div>

      <ReportSection
        title="Antibiotic usage over time"
        description="Courses started and distinct animals treated. Tracked because resistance monitoring is a real obligation, and a farm that cannot measure its usage cannot show it is reducing."
      >
        <LineChart
          title=""
          yZero
          series={[
            {
              name: "Courses",
              points: antibiotics.buckets.map((bucket, i) => ({
                label: bucket.label,
                value: antibiotics.courses[i],
              })),
            },
            {
              name: "Animals treated",
              points: antibiotics.buckets.map((bucket, i) => ({
                label: bucket.label,
                value: antibiotics.animals[i],
              })),
            },
          ]}
          formatValue={(value) => String(Math.round(value))}
          emptyMessage="No antibiotic treatments recorded in this period."
        />
      </ReportSection>

      <ReportSection
        title="Disease prevalence by category"
        description="Illness and injury records only — vaccinations and routine exams are excluded."
      >
        <LineChart
          title=""
          yZero
          series={prevalence.series.map((series) => ({
            name: HEALTH_CATEGORY_LABELS[series.name as HealthCategory] ?? series.name,
            points: prevalence.buckets.map((bucket, i) => ({
              label: bucket.label,
              value: series.values[i],
            })),
          }))}
          formatValue={(value) => String(Math.round(value))}
          emptyMessage="No illness or injury recorded in this period."
        />
      </ReportSection>

      <ReportSection title="Treatment cost by category">
        <BarChart
          title=""
          data={costs.map((row) => ({
            label: HEALTH_CATEGORY_LABELS[row.category as HealthCategory] ?? row.category,
            value: row.costCents,
            hint: `${row.cases} case${row.cases === 1 ? "" : "s"}`,
          }))}
          formatValue={(value) => formatCents(value)}
          emptyMessage="No treatment costs recorded."
        />

        {costs.length > 0 ? (
          <Card className="mt-4 p-0">
            <Table>
              <Thead>
                <Tr>
                  <Th>Category</Th>
                  <Th className="text-right">Cases</Th>
                  <Th className="text-right">Cost</Th>
                  <Th className="text-right">Per case</Th>
                </Tr>
              </Thead>
              <Tbody>
                {costs.map((row) => (
                  <Tr key={row.category}>
                    <Td>{HEALTH_CATEGORY_LABELS[row.category as HealthCategory] ?? row.category}</Td>
                    <Td className="text-right tabular-nums">{row.cases}</Td>
                    <Td className="text-right tabular-nums">{formatCents(row.costCents)}</Td>
                    <Td className="text-right tabular-nums">
                      {row.cases > 0 ? formatCents(Math.round(row.costCents / row.cases)) : "—"}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Card>
        ) : null}
      </ReportSection>
    </ReportShell>
  );
}
