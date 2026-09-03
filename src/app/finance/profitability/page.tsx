import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { BarChart, BAD } from "@/components/charts";
import { FinanceSubnav } from "@/components/finance/finance-subnav";
import { PeriodPicker } from "@/components/finance/period-picker";
import { requireRole, FINANCE_ROLES } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { getProfitabilityInputs } from "@/lib/db/finance";
import {
  byBloodline,
  byBreed,
  byPen,
  computeProfitability,
  summariseProfitability,
  type ProfitabilityGroup,
} from "@/lib/finance/profitability";
import { resolvePeriod } from "@/lib/finance/period";
import { formatCents, formatKg, formatPercent } from "@/lib/format";

function GroupTable({ title, groups }: { title: string; groups: ProfitabilityGroup[] }) {
  if (groups.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="mb-3 text-lg font-medium">{title}</h2>
      <Card className="p-0">
        <Table>
          <Thead>
            <Tr>
              <Th>{title.replace("Profitability by ", "")}</Th>
              <Th className="text-right">Animals</Th>
              <Th className="text-right">Sold</Th>
              <Th className="text-right">Cost</Th>
              <Th className="text-right">Revenue</Th>
              <Th className="text-right">Margin</Th>
              <Th className="text-right">Cost / kg gain</Th>
            </Tr>
          </Thead>
          <Tbody>
            {groups.map((group) => (
              <Tr key={group.key}>
                <Td className="font-medium">{group.label}</Td>
                <Td className="text-right tabular-nums">{group.animalCount}</Td>
                <Td className="text-right tabular-nums">{group.soldCount}</Td>
                <Td className="text-right tabular-nums">{formatCents(group.costCents)}</Td>
                <Td className="text-right tabular-nums">{formatCents(group.revenueCents)}</Td>
                <Td
                  className={`text-right tabular-nums font-medium ${
                    group.marginCents >= 0
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-red-700 dark:text-red-400"
                  }`}
                >
                  {formatCents(group.marginCents)}
                  {group.marginFraction !== null ? (
                    <span className="block text-xs font-normal text-zinc-500 dark:text-zinc-400">
                      {formatPercent(group.marginFraction, 0)}
                    </span>
                  ) : null}
                </Td>
                <Td className="text-right tabular-nums">
                  {group.costPerKgGainCents === null ? "—" : formatCents(group.costPerKgGainCents)}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Card>
    </div>
  );
}

export default async function ProfitabilityPage({
  searchParams,
}: PageProps<"/finance/profitability">) {
  const user = await requireRole(FINANCE_ROLES);
  const farmId = await getActiveFarmId(user);

  const params = await searchParams;
  const period = resolvePeriod(
    typeof params.period === "string" ? params.period : undefined,
    typeof params.from === "string" ? params.from : undefined,
    typeof params.to === "string" ? params.to : undefined
  );

  const inputs = await getProfitabilityInputs(farmId, { start: period.start, end: period.end });
  const result = computeProfitability(inputs);
  const totals = summariseProfitability(result);

  const sold = result.animals
    .filter((animal) => animal.soldAt !== null)
    .sort((a, b) => b.marginCents - a.marginCents);

  return (
    <>
      <PageHeader
        title="Profitability"
        description="What each animal cost to raise and what it returned."
      />
      <FinanceSubnav current="/finance/profitability" />
      <PeriodPicker period={period} action="/finance/profitability" />

      {result.animals.length === 0 ? (
        <EmptyState
          title="Nothing to analyse yet"
          description="Profitability needs animals with recorded feeding, health costs or sales in this period."
        />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Attributable cost"
              value={formatCents(totals.costCents)}
              hint={`${totals.animalCount} animals`}
            />
            <StatTile
              label="Revenue"
              value={formatCents(totals.revenueCents)}
              hint={`${totals.soldCount} sold`}
            />
            <StatTile
              label="Margin"
              value={formatCents(totals.marginCents)}
              hint={`${formatCents(totals.marginAfterOverheadCents)} after overheads`}
            />
            <StatTile
              label="Cost per kg gain"
              value={
                totals.costPerKgGainCents === null ? "—" : formatCents(totals.costPerKgGainCents)
              }
              hint={`${formatKg(totals.totalGainKg, 0)} total gain`}
            />
          </div>

          {/*
            Stating the method rather than burying it. Per-animal figures here
            are attributable costs only — feed the animal is recorded as having
            eaten, its own treatments, its acquisition price. Farm-level
            overheads are shown separately because splitting labour and
            electricity across pigs by headcount would look precise and mean
            almost nothing.
          */}
          <Card className="mb-6">
            <h2 className="mb-2 font-medium">How these numbers are built</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
              <li>
                Directly attributable costs: the animal&apos;s own treatments and medications, feed
                recorded against it individually, and its acquisition price.
              </li>
              <li>
                Pen-level feed is divided between the animals actually resident in that pen at the
                time, using pen movement history.
              </li>
              <li>
                Farm-level overheads ({formatCents(result.overheadCents)} — labour, utilities,
                housing, transport, marketing) are <strong>not</strong> mixed into the per-animal
                cost. They are allocated by days on farm and shown as a separate line, because
                spreading them across pigs by headcount would look precise while meaning very
                little.
              </li>
              {result.unattributedPenFeedCents > 0 ? (
                <li>
                  {formatCents(result.unattributedPenFeedCents)} of pen feed could not be matched to
                  any identifiable resident and is excluded from per-animal cost.
                </li>
              ) : null}
              <li>Break-even weight is projected where no sale price has been realised yet.</li>
            </ul>
          </Card>

          <GroupTable title="Profitability by pen" groups={byPen(result.animals)} />
          <GroupTable title="Profitability by breed" groups={byBreed(result.animals)} />
          <GroupTable title="Profitability by bloodline" groups={byBloodline(result.animals)} />

          {sold.length > 0 ? (
            <>
              <div className="mb-6">
                <BarChart
                  title="Margin per animal sold"
                  description="Revenue less directly attributable cost."
                  data={sold.slice(0, 15).map((animal) => ({
                    label: animal.tagNumber,
                    value: animal.marginCents,
                    hint: animal.breed,
                    color: animal.marginCents >= 0 ? undefined : BAD,
                  }))}
                  formatValue={(value) => formatCents(value)}
                />
              </div>

              <h2 className="mb-3 text-lg font-medium">Animals sold</h2>
              <Card className="p-0">
                <Table>
                  <Thead>
                    <Tr>
                      <Th>Tag</Th>
                      <Th>Breed</Th>
                      <Th className="text-right">Days on farm</Th>
                      <Th className="text-right">Gain</Th>
                      <Th className="text-right">Cost</Th>
                      <Th className="text-right">Revenue</Th>
                      <Th className="text-right">Margin</Th>
                      <Th className="text-right">Break-even</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {sold.map((animal) => (
                      <Tr key={animal.pigId}>
                        <Td>
                          <Link
                            href={`/animals/${animal.pigId}`}
                            className="font-medium underline underline-offset-2"
                          >
                            {animal.tagNumber}
                          </Link>
                        </Td>
                        <Td>{animal.breed}</Td>
                        <Td className="text-right tabular-nums">{animal.daysOnFarm}</Td>
                        <Td className="text-right tabular-nums">{formatKg(animal.gainKg)}</Td>
                        <Td className="text-right tabular-nums">
                          {formatCents(animal.cost.totalAttributableCents)}
                        </Td>
                        <Td className="text-right tabular-nums">{formatCents(animal.revenueCents)}</Td>
                        <Td
                          className={`text-right tabular-nums font-medium ${
                            animal.marginCents >= 0
                              ? "text-emerald-700 dark:text-emerald-400"
                              : "text-red-700 dark:text-red-400"
                          }`}
                        >
                          {formatCents(animal.marginCents)}
                        </Td>
                        <Td className="text-right tabular-nums">
                          {animal.breakEvenWeightKg === null ? (
                            "—"
                          ) : (
                            <>
                              {formatKg(animal.breakEvenWeightKg)}
                              {animal.breakEvenIsProjected ? (
                                <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                                  projected
                                </span>
                              ) : null}
                            </>
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Card>
            </>
          ) : null}
        </>
      )}
    </>
  );
}
