import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { BarChart } from "@/components/charts";
import { FeedSubnav } from "@/components/feed/feed-subnav";
import { ProgramForm } from "@/components/feed/program-form";
import { createFeedingProgram, setFeedingProgramActive } from "@/app/feed/programs/actions";
import { ADMIN_ROLES, requireRole } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { formatCents, formatKg, formatPercent } from "@/lib/format";
import { LIFE_STAGE_LABELS } from "@/lib/labels";
import { getFeedStockLevels, getHerdWithStages, listFeedTypes, listFeedingPrograms } from "@/lib/db/feed";
import { daysOfCover, summariseRequirement, type RationProgram } from "@/lib/feed/ration";

/**
 * Feeding programmes, and what they add up to.
 *
 * The projection under the table is the reason this screen is not just a CRUD
 * list: a ration per animal is abstract, "your herd eats 412 kg a day and the
 * grower mash runs out in six" is a purchase order. Days of cover is computed
 * against usable (in-date) stock only.
 */
export default async function FeedingProgramsPage() {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);

  const [programs, feedTypes, herd, levels] = await Promise.all([
    listFeedingPrograms(farmId),
    listFeedTypes(farmId, { activeOnly: true }),
    getHerdWithStages(farmId),
    getFeedStockLevels(farmId),
  ]);

  const rationPrograms: RationProgram[] = programs
    .filter((program) => program.isActive)
    .map((program) => ({
      id: program.id,
      name: program.name,
      stage: program.stage,
      feedTypeId: program.feedTypeId,
      feedTypeName: program.feedType.name,
      dailyKgPerAnimal: program.dailyKgPerAnimal,
      ageDaysMin: program.ageDaysMin,
      ageDaysMax: program.ageDaysMax,
      pctOfBodyweight: program.pctOfBodyweight,
      costPerKgCents: program.feedType.costPerKgCents,
    }));

  const requirement = summariseRequirement(rationPrograms, herd);
  const stockByFeedType = new Map(levels.map((level) => [level.feedTypeId, level]));

  return (
    <div>
      <PageHeader
        title="Feeding programmes"
        description="Standing rations by production stage, and what the current herd needs each day."
      />

      <FeedSubnav active="/feed/programs" role={user.role} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Daily feed requirement"
          value={formatKg(requirement.totalDailyKg, 0)}
          hint={`For ${herd.length} live ${herd.length === 1 ? "animal" : "animals"}`}
        />
        <StatTile
          label="Daily feed cost"
          value={formatCents(requirement.totalDailyCostCents)}
          hint="At each feed's default price"
        />
        <StatTile
          label="Animals without a ration"
          value={String(requirement.uncovered.length)}
          hint={
            requirement.uncovered.length > 0
              ? "No active programme covers their stage and age"
              : "Every animal is covered"
          }
        />
      </div>

      {requirement.byFeedType.length > 0 ? (
        <Card className="mb-6">
          <BarChart
            title="Daily requirement by feed"
            description="What the herd would eat today if every pen were fed to programme."
            data={requirement.byFeedType.map((row) => ({
              label: row.feedTypeName,
              value: row.dailyKg,
              hint: `${row.animalCount} animals`,
            }))}
            formatValue={(value) => formatKg(value, 1)}
          />

          <Table className="mt-6">
            <Thead>
              <Tr>
                <Th>Feed</Th>
                <Th className="text-right">Per day</Th>
                <Th className="text-right">Cost/day</Th>
                <Th className="text-right">Usable stock</Th>
                <Th className="text-right">Days of cover</Th>
              </Tr>
            </Thead>
            <Tbody>
              {requirement.byFeedType.map((row) => {
                const stock = stockByFeedType.get(row.feedTypeId);
                const cover = daysOfCover(stock?.usableKg ?? 0, row.dailyKg);
                return (
                  <Tr key={row.feedTypeId}>
                    <Td className="font-medium">{row.feedTypeName}</Td>
                    <Td className="text-right tabular-nums">{formatKg(row.dailyKg)}</Td>
                    <Td className="text-right tabular-nums">{formatCents(row.dailyCostCents)}</Td>
                    <Td className="text-right tabular-nums">{formatKg(stock?.usableKg ?? 0, 0)}</Td>
                    <Td className="text-right tabular-nums">
                      {cover === null ? (
                        "—"
                      ) : cover < 7 ? (
                        <Badge variant="danger">{cover.toFixed(1)} d</Badge>
                      ) : cover < 14 ? (
                        <Badge variant="warning">{cover.toFixed(1)} d</Badge>
                      ) : (
                        `${cover.toFixed(1)} d`
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </Card>
      ) : null}

      {requirement.byStage.length > 0 ? (
        <Card className="mb-6">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Requirement by stage
          </h2>
          <Table>
            <Thead>
              <Tr>
                <Th>Stage</Th>
                <Th className="text-right">Animals</Th>
                <Th className="text-right">Per day</Th>
                <Th className="text-right">Cost/day</Th>
                <Th className="text-right">Uncovered</Th>
              </Tr>
            </Thead>
            <Tbody>
              {requirement.byStage.map((row) => (
                <Tr key={row.stage}>
                  <Td className="font-medium">{LIFE_STAGE_LABELS[row.stage]}</Td>
                  <Td className="text-right tabular-nums">{row.animalCount}</Td>
                  <Td className="text-right tabular-nums">{formatKg(row.dailyKg)}</Td>
                  <Td className="text-right tabular-nums">{formatCents(row.dailyCostCents)}</Td>
                  <Td className="text-right tabular-nums">
                    {row.uncoveredCount > 0 ? (
                      <Badge variant="warning">{row.uncoveredCount}</Badge>
                    ) : (
                      "—"
                    )}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      ) : null}

      <Card className="mb-6">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Programmes</h2>

        {programs.length === 0 ? (
          <EmptyState
            title="No feeding programmes yet"
            description="A programme says what one animal at a given stage gets per day. Add one below and the requirement projection above starts working."
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Programme</Th>
                <Th>Stage</Th>
                <Th>Feed</Th>
                <Th>Age window</Th>
                <Th className="text-right">Ration</Th>
                <Th className="text-right">Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {programs.map((program) => (
                <Tr key={program.id} className={program.isActive ? "" : "opacity-60"}>
                  <Td>
                    <Link
                      href={`/feed/programs/${program.id}`}
                      className="font-medium underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-900 dark:decoration-zinc-700 dark:hover:decoration-zinc-100"
                    >
                      {program.name}
                    </Link>
                    {!program.isActive ? (
                      <Badge variant="warning" className="ml-2">
                        Inactive
                      </Badge>
                    ) : null}
                  </Td>
                  <Td>{LIFE_STAGE_LABELS[program.stage]}</Td>
                  <Td>{program.feedType.name}</Td>
                  <Td className="tabular-nums">
                    {program.ageDaysMin === null && program.ageDaysMax === null
                      ? "Any age"
                      : `${program.ageDaysMin ?? 0}–${program.ageDaysMax ?? "∞"} d`}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {program.pctOfBodyweight !== null
                      ? `${formatPercent(program.pctOfBodyweight, 1)} of bodyweight`
                      : `${formatKg(program.dailyKgPerAnimal, 2)}/day`}
                  </Td>
                  <Td className="text-right">
                    <form action={setFeedingProgramActive} className="inline-block">
                      <input type="hidden" name="id" value={program.id} />
                      <input
                        type="hidden"
                        name="isActive"
                        value={program.isActive ? "false" : "true"}
                      />
                      <SubmitButton variant="secondary" pendingLabel="…">
                        {program.isActive ? "Deactivate" : "Activate"}
                      </SubmitButton>
                    </form>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Add a programme
        </h2>
        {feedTypes.length === 0 ? (
          <EmptyState
            title="Add a feed type first"
            description="A programme has to point at a feed product."
          />
        ) : (
          <ProgramForm
            action={createFeedingProgram}
            feedTypes={feedTypes}
            submitLabel="Add programme"
          />
        )}
      </Card>
    </div>
  );
}
