import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { BarChart, LineChart } from "@/components/charts";
import { FinanceSubnav } from "@/components/finance/finance-subnav";
import { PeriodPicker } from "@/components/finance/period-picker";
import { requireRole, FINANCE_ROLES } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { getCategoryBreakdown, getMonthlyTrend, getPeriodSummary } from "@/lib/db/finance";
import { resolvePeriod, previousPeriod, changeFraction } from "@/lib/finance/period";
import { TRANSACTION_CATEGORY_LABELS } from "@/lib/labels";
import { formatCents, formatPercent } from "@/lib/format";

export default async function FinancePage({ searchParams }: PageProps<"/finance">) {
  const user = await requireRole(FINANCE_ROLES);
  const farmId = await getActiveFarmId(user);

  const { period: preset, from, to } = await searchParams;
  const period = resolvePeriod(
    typeof preset === "string" ? preset : undefined,
    typeof from === "string" ? from : undefined,
    typeof to === "string" ? to : undefined
  );
  const prior = previousPeriod(period);

  const [summary, priorSummary, expenses, income, trend] = await Promise.all([
    getPeriodSummary(farmId, period.start, period.end),
    getPeriodSummary(farmId, prior.start, prior.end),
    getCategoryBreakdown(farmId, period.start, period.end, "EXPENSE"),
    getCategoryBreakdown(farmId, period.start, period.end, "INCOME"),
    getMonthlyTrend(farmId, 6),
  ]);

  const netChange = changeFraction(priorSummary.netCents, summary.netCents);

  return (
    <>
      <PageHeader title="Finance" description="Income, costs and margin for the farm." />
      <FinanceSubnav current="/finance" />
      <PeriodPicker period={period} action="/finance" />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Income"
          value={formatCents(summary.incomeCents)}
          hint={`Previous period ${formatCents(priorSummary.incomeCents)}`}
        />
        <StatTile
          label="Expenses"
          value={formatCents(summary.expenseCents)}
          hint={`Previous period ${formatCents(priorSummary.expenseCents)}`}
        />
        <StatTile
          label="Net"
          value={formatCents(summary.netCents)}
          hint={
            netChange === null
              ? `${summary.transactionCount} transactions`
              : `${netChange >= 0 ? "+" : ""}${formatPercent(netChange, 0)} vs previous period`
          }
        />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <BarChart
          title="Expenses by category"
          data={expenses.map((row) => ({
            label: TRANSACTION_CATEGORY_LABELS[row.category],
            value: row.amountCents,
            hint: `${row.count} entr${row.count === 1 ? "y" : "ies"}`,
          }))}
          formatValue={(value) => formatCents(value)}
          emptyMessage="No expenses recorded in this period."
        />
        <BarChart
          title="Income by source"
          data={income.map((row) => ({
            label: TRANSACTION_CATEGORY_LABELS[row.category],
            value: row.amountCents,
            hint: `${row.count} entr${row.count === 1 ? "y" : "ies"}`,
          }))}
          formatValue={(value) => formatCents(value)}
          emptyMessage="No income recorded in this period."
        />
      </div>

      <LineChart
        title="Six-month trend"
        description="Income, expenses and the resulting margin, by month."
        yZero
        series={[
          { name: "Income", points: trend.map((p) => ({ label: p.label, value: p.incomeCents })) },
          { name: "Expenses", points: trend.map((p) => ({ label: p.label, value: p.expenseCents })) },
          { name: "Net", points: trend.map((p) => ({ label: p.label, value: p.netCents })) },
        ]}
        formatValue={(value) => formatCents(value)}
        emptyMessage="Not enough history yet."
      />
    </>
  );
}
