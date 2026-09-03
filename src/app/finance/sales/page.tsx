import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { FinanceSubnav } from "@/components/finance/finance-subnav";
import { PeriodPicker } from "@/components/finance/period-picker";
import { requireRole, FINANCE_ROLES } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { listAnimalSales, getAverageSalePricePerKgCents } from "@/lib/db/finance";
import { resolvePeriod } from "@/lib/finance/period";
import { ANIMAL_SALE_TYPE_LABELS } from "@/lib/labels";
import { formatCents, formatDate } from "@/lib/format";

export default async function AnimalSalesPage({ searchParams }: PageProps<"/finance/sales">) {
  const user = await requireRole(FINANCE_ROLES);
  const farmId = await getActiveFarmId(user);

  const params = await searchParams;
  const period = resolvePeriod(
    typeof params.period === "string" ? params.period : undefined,
    typeof params.from === "string" ? params.from : undefined,
    typeof params.to === "string" ? params.to : undefined
  );

  const [sales, avgPricePerKgCents] = await Promise.all([
    listAnimalSales(farmId, { start: period.start, end: period.end }),
    // Takes a "since" date rather than a window: the average price is more
    // useful as a running figure than one clipped to the period being viewed.
    getAverageSalePricePerKgCents(farmId, period.start),
  ]);

  const totalCents = sales.reduce((sum, sale) => sum + sale.totalCents, 0);
  const animalCount = sales.reduce((sum, sale) => sum + sale._count.items, 0);

  return (
    <>
      <PageHeader
        title="Animal sales"
        description="Sales of finished pigs, feeder pigs, breeding stock and culls."
        actions={<ButtonLink href="/finance/sales/new">Record a sale</ButtonLink>}
      />
      <FinanceSubnav current="/finance/sales" />
      <PeriodPicker period={period} action="/finance/sales" />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Sales" value={String(sales.length)} hint={`${animalCount} animals`} />
        <StatTile label="Revenue" value={formatCents(totalCents)} />
        <StatTile
          label="Average price"
          value={avgPricePerKgCents === null ? "—" : `${formatCents(avgPricePerKgCents)}/kg`}
          hint={`Animals sold by weight since ${formatDate(period.start)}`}
        />
      </div>

      {sales.length === 0 ? (
        <EmptyState
          title="No sales recorded in this period"
          description="Recording a sale marks the animals sold, posts the income to the ledger, and refuses any animal still inside a medication withdrawal window."
          action={<ButtonLink href="/finance/sales/new">Record a sale</ButtonLink>}
        />
      ) : (
        <Card className="p-0">
          <Table>
            <Thead>
              <Tr>
                <Th>Date</Th>
                <Th>Buyer</Th>
                <Th>Type</Th>
                <Th className="text-right">Animals</Th>
                <Th className="text-right">Total</Th>
                <Th>Recorded by</Th>
              </Tr>
            </Thead>
            <Tbody>
              {sales.map((sale) => (
                <Tr key={sale.id}>
                  <Td className="whitespace-nowrap">{formatDate(sale.soldAt)}</Td>
                  <Td>
                    <span className="font-medium">{sale.buyerName}</span>
                    {sale.buyerContact ? (
                      <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                        {sale.buyerContact}
                      </span>
                    ) : null}
                  </Td>
                  <Td>
                    <Badge>{ANIMAL_SALE_TYPE_LABELS[sale.saleType]}</Badge>
                  </Td>
                  <Td className="text-right tabular-nums">{sale._count.items}</Td>
                  <Td className="text-right tabular-nums font-medium">{formatCents(sale.totalCents)}</Td>
                  <Td className="text-zinc-500 dark:text-zinc-400">{sale.createdBy?.name ?? "—"}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      )}

      <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
        Sales are permanent records: they mark animals sold and post income to the ledger. Correct a
        mistake by adjusting the ledger entry rather than deleting the sale, so the animal&apos;s exit
        and the money stay consistent.{" "}
        <Link href="/finance/transactions" className="underline underline-offset-2">
          Go to transactions
        </Link>
      </p>
    </>
  );
}
