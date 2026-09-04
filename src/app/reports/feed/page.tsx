import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { ReportShell, ReportSection } from "@/components/reports/report-shell";
import { resolveDateRange } from "@/components/reports/date-range";
import { BarChart } from "@/components/charts";
import { requireUser } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { feedEfficiency, feedUsage } from "@/lib/db/reports";
import { formatCents, formatKg, formatPercent } from "@/lib/format";

export default async function FeedReportPage({ searchParams }: PageProps<"/reports/feed">) {
  const user = await requireUser();
  const farmId = await getActiveFarmId(user);
  const range = resolveDateRange(await searchParams);

  const [usage, efficiency] = await Promise.all([
    feedUsage(farmId, range),
    feedEfficiency(farmId, range),
  ]);

  const bySupplier = new Map<string, { kg: number; costCents: number }>();
  for (const row of usage) {
    const key = row.supplierName ?? "No supplier recorded";
    const entry = bySupplier.get(key) ?? { kg: 0, costCents: 0 };
    entry.kg += row.allocatedKg;
    entry.costCents += row.costCents;
    bySupplier.set(key, entry);
  }

  const totalAllocated = usage.reduce((sum, row) => sum + row.allocatedKg, 0);
  const totalConsumed = usage.reduce((sum, row) => sum + row.consumedKg, 0);
  const wastage = totalAllocated > 0 ? 1 - totalConsumed / totalAllocated : null;

  return (
    <ReportShell
      title="Feed & conversion"
      decision="What feed costs per kilo of gain, and which supplier is actually cheaper."
      path="/reports/feed"
      range={range}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Feed used" value={formatKg(totalConsumed, 0)} hint={`${formatKg(totalAllocated, 0)} allocated`} />
        <StatTile label="Feed cost" value={formatCents(efficiency.feedCostCents)} />
        <StatTile
          label="Feed conversion"
          value={efficiency.fcr === null ? "—" : efficiency.fcr.toFixed(2)}
          hint="kg feed per kg gain"
        />
        <StatTile
          label="Cost per kg gain"
          value={
            efficiency.costPerKgGainCents === null
              ? "—"
              : formatCents(efficiency.costPerKgGainCents)
          }
          hint="The benchmark that decides whether a batch paid"
        />
      </div>

      {wastage !== null && wastage > 0.05 ? (
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40">
          <p className="text-sm text-amber-900 dark:text-amber-200">
            {formatPercent(wastage, 0)} of allocated feed was not recorded as eaten
            ({formatKg(totalAllocated - totalConsumed, 0)}). That is either genuine spillage worth
            fixing at the feeder, or consumption that is not being written down — both are worth
            knowing, and they look identical from here.
          </p>
        </Card>
      ) : null}

      <ReportSection title="Cost by feed type">
        <BarChart
          title=""
          data={usage.map((row) => ({
            label: row.name,
            value: row.costCents,
            hint: formatKg(row.allocatedKg, 0),
          }))}
          formatValue={(value) => formatCents(value)}
          emptyMessage="No feeding recorded in this period."
        />
      </ReportSection>

      <ReportSection
        title="Supplier comparison"
        description="Effective cost per kilogram actually fed, which is the number that matters rather than the quoted price."
      >
        {bySupplier.size === 0 ? (
          <Card>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No feeding recorded.</p>
          </Card>
        ) : (
          <Card className="p-0">
            <Table>
              <Thead>
                <Tr>
                  <Th>Supplier</Th>
                  <Th className="text-right">Fed</Th>
                  <Th className="text-right">Cost</Th>
                  <Th className="text-right">Effective /kg</Th>
                </Tr>
              </Thead>
              <Tbody>
                {[...bySupplier.entries()]
                  .sort((a, b) => b[1].costCents - a[1].costCents)
                  .map(([name, entry]) => (
                    <Tr key={name}>
                      <Td>{name}</Td>
                      <Td className="text-right tabular-nums">{formatKg(entry.kg, 0)}</Td>
                      <Td className="text-right tabular-nums">{formatCents(entry.costCents)}</Td>
                      <Td className="text-right tabular-nums">
                        {entry.kg > 0 ? formatCents(Math.round(entry.costCents / entry.kg)) : "—"}
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
