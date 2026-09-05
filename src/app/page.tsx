import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { ButtonLink } from "@/components/ui/button";
import { Table, Tbody, Tr, Td, Thead, Th } from "@/components/ui/table";
import { AlertPanel } from "@/components/dashboard/alert-panel";
import { prisma } from "@/lib/prisma";
import { requireUser, canSeeFinancials } from "@/lib/auth";
import { getActiveFarmId, getFarmSettings } from "@/lib/active-farm";
import { getAlerts, countAlerts } from "@/lib/alerts";
import { getParityMap } from "@/lib/db/animals";
import { getFeedStockLevels } from "@/lib/db/feed";
import { getPeriodSummary } from "@/lib/db/finance";
import { getPenSummary } from "@/lib/db/pens";
import { loadPedigreeIndex } from "@/lib/breeding/pedigree";
import { createInbreedingCalculator } from "@/lib/breeding/inbreeding";
import { deriveLifeStage } from "@/lib/life-stage";
import { LIFE_STAGE_LABELS } from "@/lib/labels";
import { addDays, formatCents, formatDate, formatKg, formatPercent } from "@/lib/format";
import type { LifeStage } from "@prisma/client";

const STAGE_ORDER: LifeStage[] = ["YOUNG", "WEANER", "GROWER", "FINISHER", "MAIDEN_FEMALE", "BREEDING_FEMALE", "BREEDING_MALE"];

export default async function DashboardPage() {
  const user = await requireUser();
  const farmId = await getActiveFarmId(user);
  const settings = await getFarmSettings(farmId);
  const now = new Date();
  const showMoney = canSeeFinancials(user.role);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [alerts, herd, parity, pens, feed, upcoming, recentHealth, finance, index] =
    await Promise.all([
      getAlerts(farmId, user.role, now),
      prisma.animal.findMany({
        where: { farmId, status: "ACTIVE" },
        select: { id: true, sex: true, dateOfBirth: true },
      }),
      getParityMap(farmId),
      getPenSummary(farmId),
      getFeedStockLevels(farmId, now),
      prisma.breedingRecord.findMany({
        where: {
          farmId,
          pregnancyStatus: { in: ["PENDING", "CONFIRMED"] },
          expectedFarrowingDate: { lte: addDays(now, 14) },
        },
        select: {
          id: true,
          expectedFarrowingDate: true,
          dam: { select: { id: true, tagNumber: true, name: true } },
        },
        orderBy: { expectedFarrowingDate: "asc" },
        take: 8,
      }),
      prisma.healthRecord.findMany({
        where: { farmId },
        select: {
          id: true,
          recordedAt: true,
          diagnosis: true,
          outcome: true,
          animal: { select: { id: true, tagNumber: true } },
        },
        orderBy: { recordedAt: "desc" },
        take: 6,
      }),
      showMoney ? getPeriodSummary(farmId, monthStart, monthEnd) : Promise.resolve(null),
      loadPedigreeIndex(farmId),
    ]);

  const counts = countAlerts(alerts);

  // Life stage is derived rather than stored, so it is computed here from the
  // same helper every other screen uses — a stored copy would go stale the day
  // nobody moves a gilt to "sow" after her first litter.
  const byStage = new Map<LifeStage, number>();
  for (const animal of herd) {
    const stage = deriveLifeStage({
      dateOfBirth: animal.dateOfBirth,
      sex: animal.sex,
      parity: parity.get(animal.id) ?? 0,
      weaningAgeDays: settings.weaningAgeDays,
      minBreedingAgeDays:
        animal.sex === "FEMALE" ? settings.minBreedingAgeDaysFemale : settings.minBreedingAgeDaysMale,
      asOf: now,
    });
    byStage.set(stage, (byStage.get(stage) ?? 0) + 1);
  }

  const calculator = createInbreedingCalculator(index);
  const herdF =
    herd.length > 0
      ? herd.reduce((sum, animal) => sum + calculator.inbreedingOf(animal.id), 0) / herd.length
      : 0;

  const lowFeed = feed.filter((row) => row.belowReorderLevel || row.outOfStock);
  const underTreatment = recentHealth.filter((row) => row.outcome === "ONGOING").length;

  // A brand-new farm gets a route in, not a wall of zeros that says nothing
  // about what to do next.
  if (herd.length === 0) {
    return (
      <>
        <PageHeader
          title={`Welcome, ${user.name}`}
          description="Nothing has been recorded yet. Here is the shortest path to a working system."
        />
        <Card className="space-y-4">
          <ol className="list-decimal space-y-3 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
            <li>
              <Link href="/pens" className="underline underline-offset-2">Set up your pens</Link> —
              occupancy, capacity limits and the biosecurity cleaning record all depend on them.
            </li>
            <li>
              <Link href="/animals/new" className="underline underline-offset-2">Add your breeding stock</Link> —
              boars and sows first. Recording their parents where you know them is what makes the
              inbreeding checks meaningful later.
            </li>
            <li>
              <Link href="/feed/types" className="underline underline-offset-2">Add your feed types</Link> and
              record a delivery, so stock and cost tracking start from day one.
            </li>
            <li>
              <Link href="/settings" className="underline underline-offset-2">Check the farm settings</Link> —
              gestation length, inbreeding limits and vaccination protocol drive every alert here.
            </li>
          </ol>
          <ButtonLink href="/animals/new">Add the first animal</ButtonLink>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`Good day, ${user.name}`}
        description={
          counts.total === 0
            ? "Nothing needs attention."
            : `${counts.total} thing${counts.total === 1 ? "" : "s"} need attention — ${counts.critical} critical, ${counts.warning} warning.`
        }
      />

      <AlertPanel alerts={alerts} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Active animals"
          value={String(herd.length)}
          hint={`Across ${pens.penCount} pens · ${pens.utilisation === null ? "—" : formatPercent(pens.utilisation, 0)} full`}
        />
        <StatTile
          label="Farrowing within 14 days"
          value={String(upcoming.length)}
          hint={upcoming.length > 0 ? "Prepare farrowing pens" : "None due"}
        />
        <StatTile
          label="Under treatment"
          value={String(underTreatment)}
          hint={counts.critical > 0 ? "Check the alerts above" : "No severe cases"}
        />
        <StatTile
          label="Herd inbreeding"
          value={formatPercent(herdF)}
          hint={`Limit ${formatPercent(settings.maxInbreedingCoefficient)}`}
        />
      </div>

      {showMoney && finance ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <StatTile label="Income this month" value={formatCents(finance.incomeCents)} />
          <StatTile label="Expenses this month" value={formatCents(finance.expenseCents)} />
          <StatTile
            label="Margin"
            value={formatCents(finance.netCents)}
            hint={`${finance.transactionCount} entries`}
          />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-lg font-medium">Herd composition</h2>
          <Card className="p-0">
            <Table>
              <Tbody>
                {STAGE_ORDER.filter((stage) => (byStage.get(stage) ?? 0) > 0).map((stage) => (
                  <Tr key={stage}>
                    <Td>{LIFE_STAGE_LABELS[stage]}</Td>
                    <Td className="text-right tabular-nums font-medium">{byStage.get(stage)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Card>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-medium">Farrowing soon</h2>
          <Card className="p-0">
            {upcoming.length === 0 ? (
              <p className="p-6 text-sm text-zinc-500 dark:text-zinc-400">
                No farrowings expected in the next two weeks.
              </p>
            ) : (
              <Table>
                <Thead>
                  <Tr>
                    <Th>Sow</Th>
                    <Th>Expected</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {upcoming.map((record) => (
                    <Tr key={record.id}>
                      <Td>
                        <Link
                          href={`/breeding/${record.id}`}
                          className="underline underline-offset-2"
                        >
                          {record.dam.tagNumber}
                        </Link>
                        {record.dam.name ? (
                          <span className="ml-1 text-xs text-zinc-500 dark:text-zinc-400">
                            {record.dam.name}
                          </span>
                        ) : null}
                      </Td>
                      <Td>{formatDate(record.expectedFarrowingDate)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </Card>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-medium">Recent health events</h2>
          <Card className="p-0">
            {recentHealth.length === 0 ? (
              <p className="p-6 text-sm text-zinc-500 dark:text-zinc-400">
                Nothing recorded yet.
              </p>
            ) : (
              <Table>
                <Tbody>
                  {recentHealth.map((record) => (
                    <Tr key={record.id}>
                      <Td>
                        <Link href={`/health/${record.id}`} className="underline underline-offset-2">
                          {record.animal?.tagNumber ?? "Batch"}
                        </Link>
                      </Td>
                      <Td>{record.diagnosis}</Td>
                      <Td className="text-right text-xs text-zinc-500 dark:text-zinc-400">
                        {formatDate(record.recordedAt)}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </Card>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-medium">Feed stock</h2>
          <Card className="p-0">
            {feed.length === 0 ? (
              <p className="p-6 text-sm text-zinc-500 dark:text-zinc-400">
                No feed types set up yet.{" "}
                <Link href="/feed/types" className="underline underline-offset-2">Add one</Link>.
              </p>
            ) : (
              <Table>
                <Thead>
                  <Tr>
                    <Th>Feed</Th>
                    <Th className="text-right">Usable</Th>
                    <Th className="text-right">Reorder at</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {feed.slice(0, 6).map((row) => (
                    <Tr key={row.feedTypeId}>
                      <Td>{row.name}</Td>
                      <Td
                        className={`text-right tabular-nums ${
                          row.belowReorderLevel || row.outOfStock
                            ? "font-medium text-red-700 dark:text-red-400"
                            : ""
                        }`}
                      >
                        {formatKg(row.usableKg, 0)}
                      </Td>
                      <Td className="text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                        {formatKg(row.reorderLevelKg, 0)}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
            {lowFeed.length > 0 ? (
              <p className="border-t border-zinc-200 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                {lowFeed.length} feed type{lowFeed.length === 1 ? "" : "s"} at or below reorder
                level. <Link href="/feed" className="underline underline-offset-2">Review stock</Link>
              </p>
            ) : null}
          </Card>
        </div>
      </div>
    </>
  );
}
