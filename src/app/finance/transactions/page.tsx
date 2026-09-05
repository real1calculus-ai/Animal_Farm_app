import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { FinanceSubnav } from "@/components/finance/finance-subnav";
import { PeriodPicker } from "@/components/finance/period-picker";
import { createTransaction } from "@/app/finance/actions";
import { requireRole, FINANCE_ROLES } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { listTransactions, resolveProvenance, isGeneratedRow } from "@/lib/db/finance";
import { resolvePeriod } from "@/lib/finance/period";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  TRANSACTION_CATEGORY_LABELS,
  TRANSACTION_DIRECTION_LABELS,
} from "@/lib/labels";
import { formatCents, formatDate, toDateInputValue } from "@/lib/format";
import type { TransactionCategory, TransactionDirection } from "@prisma/client";

const ALL_CATEGORIES = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES] as readonly string[];

export default async function TransactionsPage({
  searchParams,
}: PageProps<"/finance/transactions">) {
  const user = await requireRole(FINANCE_ROLES);
  const farmId = await getActiveFarmId(user);

  const params = await searchParams;
  const period = resolvePeriod(
    typeof params.period === "string" ? params.period : undefined,
    typeof params.from === "string" ? params.from : undefined,
    typeof params.to === "string" ? params.to : undefined
  );

  // Validated against the known enum lists rather than passed through: this is
  // a query string, and an unrecognised value must not reach Prisma.
  const direction =
    params.direction === "INCOME" || params.direction === "EXPENSE"
      ? (params.direction as TransactionDirection)
      : undefined;
  const category =
    typeof params.category === "string" && ALL_CATEGORIES.includes(params.category)
      ? (params.category as TransactionCategory)
      : undefined;
  const search = typeof params.q === "string" && params.q.trim() ? params.q.trim() : undefined;

  const rows = await listTransactions(farmId, {
    start: period.start,
    end: period.end,
    direction,
    category,
    search,
  });
  const provenance = await resolveProvenance(rows);

  const totals = rows.reduce(
    (acc, row) => {
      if (row.direction === "INCOME") acc.income += row.amountCents;
      else acc.expense += row.amountCents;
      return acc;
    },
    { income: 0, expense: 0 }
  );

  return (
    <>
      <PageHeader
        title="Transactions"
        description="Every entry in the ledger, including the rows other modules generate."
      />
      <FinanceSubnav current="/finance/transactions" />
      <PeriodPicker period={period} action="/finance/transactions" />

      <form method="get" action="/finance/transactions" className="mb-6 flex flex-wrap items-end gap-3">
        <input type="hidden" name="period" value={period.preset} />
        <input type="hidden" name="from" value={toDateInputValue(period.start)} />
        <input type="hidden" name="to" value={toDateInputValue(period.end)} />

        <label className="text-sm">
          <span className="mb-1 block font-medium text-zinc-700 dark:text-zinc-300">Direction</span>
          <Select name="direction" defaultValue={direction ?? ""} className="w-auto">
            <option value="">All</option>
            <option value="INCOME">Income</option>
            <option value="EXPENSE">Expenses</option>
          </Select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium text-zinc-700 dark:text-zinc-300">Category</span>
          <Select name="category" defaultValue={category ?? ""} className="w-auto">
            <option value="">All</option>
            {ALL_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {TRANSACTION_CATEGORY_LABELS[value as TransactionCategory]}
              </option>
            ))}
          </Select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium text-zinc-700 dark:text-zinc-300">Search</span>
          <Input name="q" defaultValue={search ?? ""} placeholder="Description" className="w-auto" />
        </label>

        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        {rows.length} entr{rows.length === 1 ? "y" : "ies"} · {formatCents(totals.income)} in ·{" "}
        {formatCents(totals.expense)} out · net {formatCents(totals.income - totals.expense)}
      </p>

      {rows.length === 0 ? (
        <div className="mb-6">
          <EmptyState
            title="No transactions in this period"
            description="Feed deliveries, treatments, pen tasks, equipment and animal sales post here automatically. Add labour, utilities and other overheads below."
          />
        </div>
      ) : (
        <Card className="mb-6 p-0">
          <Table>
            <Thead>
              <Tr>
                <Th>Date</Th>
                <Th>Category</Th>
                <Th>Description</Th>
                <Th>Source</Th>
                <Th className="text-right">Amount</Th>
              </Tr>
            </Thead>
            <Tbody>
              {rows.map((row) => {
                const source = provenance.get(row.id);
                return (
                  <Tr key={row.id}>
                    <Td className="whitespace-nowrap">{formatDate(row.occurredAt)}</Td>
                    <Td>
                      <Badge variant={row.direction === "INCOME" ? "success" : "default"}>
                        {TRANSACTION_CATEGORY_LABELS[row.category]}
                      </Badge>
                    </Td>
                    <Td>
                      {row.description ?? "—"}
                      {row.animal ? (
                        <Link
                          href={`/animals/${row.animal.id}`}
                          className="ml-2 text-xs underline underline-offset-2"
                        >
                          {row.animal.tagNumber}
                        </Link>
                      ) : null}
                    </Td>
                    <Td className="text-xs text-zinc-500 dark:text-zinc-400">
                      {source ? (
                        source.href ? (
                          <Link href={source.href} className="underline underline-offset-2">
                            {source.label}
                          </Link>
                        ) : (
                          source.label
                        )
                      ) : isGeneratedRow(row) ? (
                        "Generated"
                      ) : (
                        "Manual entry"
                      )}
                    </Td>
                    <Td
                      className={`text-right tabular-nums ${
                        row.direction === "INCOME"
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-zinc-800 dark:text-zinc-200"
                      }`}
                    >
                      {row.direction === "INCOME" ? "+" : "−"}
                      {formatCents(row.amountCents)}
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </Card>
      )}

      <Card>
        <details>
          <summary className="cursor-pointer font-medium text-zinc-900 dark:text-zinc-100">
            Add an entry
          </summary>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            For costs the rest of the system cannot generate on its own — labour, utilities,
            bedding, transport, marketing. Feed, treatments, equipment and sales post themselves.
          </p>
          <form action={createTransaction} className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Direction" htmlFor="direction" required>
              <Select id="direction" name="direction" defaultValue="EXPENSE" required>
                {Object.entries(TRANSACTION_DIRECTION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Category"
              htmlFor="new-category"
              hint="Must match the direction — income categories for income, expense for expense."
              required
            >
              <Select id="new-category" name="category" defaultValue="LABOR" required>
                <optgroup label="Expenses">
                  {EXPENSE_CATEGORIES.map((value) => (
                    <option key={value} value={value}>
                      {TRANSACTION_CATEGORY_LABELS[value]}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Income">
                  {INCOME_CATEGORIES.map((value) => (
                    <option key={value} value={value}>
                      {TRANSACTION_CATEGORY_LABELS[value]}
                    </option>
                  ))}
                </optgroup>
              </Select>
            </Field>

            <Field label="Date" htmlFor="occurredAt" required>
              <Input
                id="occurredAt"
                name="occurredAt"
                type="date"
                defaultValue={toDateInputValue(new Date())}
                required
              />
            </Field>

            <Field label="Amount" htmlFor="amountCents" required>
              <Input id="amountCents" name="amountCents" inputMode="decimal" placeholder="0.00" required />
            </Field>

            <Field label="Description" htmlFor="description" className="sm:col-span-2">
              <Textarea id="description" name="description" rows={2} placeholder="Casual labour — weekend cover" />
            </Field>

            <div className="sm:col-span-2">
              <SubmitButton pendingLabel="Saving...">Add entry</SubmitButton>
            </div>
          </form>
        </details>
      </Card>
    </>
  );
}
