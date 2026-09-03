import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { BarChart, Histogram, LineChart, BAD, GOOD, NEUTRAL } from "@/components/charts";
import { FeedSubnav } from "@/components/feed/feed-subnav";
import { windowDaysParam } from "@/components/feed/search-params";
import { requireUser } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { addDays, formatCents, formatKg, formatPercent } from "@/lib/format";
import { LIFE_STAGE_LABELS } from "@/lib/labels";
import { feedConversionRatio } from "@/lib/life-stage";
import type { LifeStage } from "@prisma/client";
import {
  getHerdWithStages,
  getIntakeRecords,
  getPensWithHerd,
  getWeightRecords,
} from "@/lib/db/feed";
import {
  CONSUMPTION_DROP_THRESHOLD,
  SLOW_GROWER_VARIANCE,
  dailyIntakeSeries,
  detectConsumptionDrop,
  effectiveIntakeKg,
  expectedWeightKg,
  growthWindow,
  weightVariance,
} from "@/lib/feed/fcr";
import { roundKg } from "@/lib/feed/allocation";

/**
 * Nutritional performance.
 *
 * The consumption-drop panel is first because it is the only thing on this
 * page that is about today. A pen going off its feed is usually the first
 * visible sign of illness — a day or more before anything else shows — and
 * catching that a day earlier is worth more than every ratio below it.
 *
 * Two approximations are made deliberately, and are worth knowing when reading
 * the numbers:
 *
 * 1. Pen-level feed is shared equally across the pen's *current* occupants.
 *    Pigs move between pens, so a long window smears some feed onto the wrong
 *    animal. The alternative — reconstructing occupancy day by day from
 *    `PenMovement` — is exact but far heavier, and the per-pen and per-stage
 *    figures, which is where decisions actually get made, are unaffected.
 * 2. Gain is measured between the first and last weigh-in inside the window,
 *    so an animal weighed once contributes feed but no gain. Those animals are
 *    excluded from FCR rather than counted as zero gain, which would drag a
 *    pen's ratio to nonsense.
 */
export default async function FeedAnalysisPage({ searchParams }: PageProps<"/feed/analysis">) {
  const user = await requireUser();
  const farmId = await getActiveFarmId(user);
  const params = await searchParams;

  const windowDays = windowDaysParam(params.days, 90);
  const to = new Date();
  const from = addDays(to, -windowDays);

  const [intake, pens, herd, weights] = await Promise.all([
    getIntakeRecords(farmId, { from, to }),
    getPensWithHerd(farmId, to),
    getHerdWithStages(farmId, to),
    getWeightRecords(farmId, { from, to }),
  ]);

  // --- Gain per animal over the window ------------------------------------
  const weighInsByPig = new Map<string, { recordedAt: Date; weightKg: number }[]>();
  for (const weight of weights) {
    const rows = weighInsByPig.get(weight.pigId) ?? [];
    rows.push({ recordedAt: weight.recordedAt, weightKg: weight.weightKg });
    weighInsByPig.set(weight.pigId, rows);
  }

  const gainByPig = new Map<string, { gainKg: number; days: number; adg: number | null }>();
  for (const [pigId, rows] of weighInsByPig) {
    const window = growthWindow(rows);
    if (!window) continue;
    gainByPig.set(pigId, {
      gainKg: window.gainKg,
      days: window.days,
      adg: window.adgKgPerDay,
    });
  }

  // --- Feed per animal, per pen -------------------------------------------
  const penMembers = new Map(pens.map((pen) => [pen.penId, pen.animals.map((a) => a.id)]));

  const feedByPig = new Map<string, { kg: number; costCents: number }>();
  const feedByPen = new Map<string, { kg: number; costCents: number }>();

  function addTo(
    map: Map<string, { kg: number; costCents: number }>,
    key: string,
    kg: number,
    costCents: number
  ) {
    const row = map.get(key) ?? { kg: 0, costCents: 0 };
    row.kg += kg;
    row.costCents += costCents;
    map.set(key, row);
  }

  for (const record of intake) {
    const kg = effectiveIntakeKg(record);
    const costCents = Math.round(kg * (record.costPerKgCents ?? 0));

    if (record.penId) addTo(feedByPen, record.penId, kg, costCents);

    if (record.pigId) {
      addTo(feedByPig, record.pigId, kg, costCents);
    } else if (record.penId) {
      const members = penMembers.get(record.penId) ?? [];
      if (members.length === 0) continue;
      for (const memberId of members) {
        addTo(feedByPig, memberId, kg / members.length, Math.round(costCents / members.length));
      }
    }
  }

  // --- FCR by pen ----------------------------------------------------------
  const penRows = pens
    .map((pen) => {
      const feed = feedByPen.get(pen.penId) ?? { kg: 0, costCents: 0 };
      const contributors = pen.animals.filter((animal) => gainByPig.has(animal.id));
      const gainKg = roundKg(
        contributors.reduce((sum, animal) => sum + (gainByPig.get(animal.id)?.gainKg ?? 0), 0)
      );
      const fcr = feedConversionRatio(feed.kg, gainKg);
      return {
        penId: pen.penId,
        penName: pen.penName,
        animalCount: pen.animals.length,
        weighedCount: contributors.length,
        feedKg: roundKg(feed.kg),
        feedCostCents: feed.costCents,
        gainKg,
        fcr,
        costPerKgGainCents: gainKg > 0 ? Math.round(feed.costCents / gainKg) : null,
      };
    })
    .filter((row) => row.feedKg > 0 || row.animalCount > 0);

  const ratedPens = penRows.filter((row) => row.fcr !== null);
  const worstFcr = ratedPens.length > 0 ? Math.max(...ratedPens.map((r) => r.fcr as number)) : 0;

  // --- FCR and ADG by stage -----------------------------------------------
  const stageRows = new Map<
    LifeStage,
    { animals: number; feedKg: number; costCents: number; gainKg: number; adgSum: number; adgCount: number }
  >();

  for (const animal of herd) {
    const row = stageRows.get(animal.stage) ?? {
      animals: 0,
      feedKg: 0,
      costCents: 0,
      gainKg: 0,
      adgSum: 0,
      adgCount: 0,
    };
    row.animals += 1;

    const feed = feedByPig.get(animal.id);
    if (feed) {
      row.feedKg += feed.kg;
      row.costCents += feed.costCents;
    }

    const gain = gainByPig.get(animal.id);
    if (gain) {
      row.gainKg += gain.gainKg;
      if (gain.adg !== null) {
        row.adgSum += gain.adg;
        row.adgCount += 1;
      }
    }

    stageRows.set(animal.stage, row);
  }

  const stageSummary = [...stageRows.entries()].map(([stage, row]) => ({
    stage,
    animals: row.animals,
    feedKg: roundKg(row.feedKg),
    costCents: row.costCents,
    gainKg: roundKg(row.gainKg),
    fcr: feedConversionRatio(row.feedKg, row.gainKg),
    adg: row.adgCount > 0 ? row.adgSum / row.adgCount : null,
    costPerKgGainCents: row.gainKg > 0 ? Math.round(row.costCents / row.gainKg) : null,
  }));

  // --- Individual animals: FCR, expected vs actual -------------------------
  const animalRows = herd
    .map((animal) => {
      const feed = feedByPig.get(animal.id);
      const gain = gainByPig.get(animal.id);
      const expected = expectedWeightKg(animal.ageDays);
      const variance =
        animal.currentWeightKg === null ? null : weightVariance(animal.currentWeightKg, animal.ageDays);

      return {
        id: animal.id,
        tagNumber: animal.tagNumber,
        name: animal.name,
        stage: animal.stage,
        penName: animal.penName,
        ageDays: animal.ageDays,
        actualKg: animal.currentWeightKg,
        expectedKg: expected,
        variance,
        adg: gain?.adg ?? null,
        feedKg: feed ? roundKg(feed.kg) : 0,
        gainKg: gain?.gainKg ?? null,
        fcr: feed && gain ? feedConversionRatio(feed.kg, gain.gainKg) : null,
        costPerKgGainCents:
          feed && gain && gain.gainKg > 0 ? Math.round(feed.costCents / gain.gainKg) : null,
      };
    })
    .sort((a, b) => (a.variance ?? 0) - (b.variance ?? 0));

  const slowGrowers = animalRows.filter(
    (row) => row.variance !== null && row.variance <= SLOW_GROWER_VARIANCE
  );

  const varianceBuckets = [
    { label: "≤ −30%", min: Number.NEGATIVE_INFINITY, max: -0.3, bad: true },
    { label: "−30 to −15%", min: -0.3, max: -0.15, bad: true },
    { label: "−15 to −5%", min: -0.15, max: -0.05, bad: false },
    { label: "−5 to +5%", min: -0.05, max: 0.05, bad: false },
    { label: "+5 to +15%", min: 0.05, max: 0.15, bad: false },
    { label: "> +15%", min: 0.15, max: Number.POSITIVE_INFINITY, bad: false },
  ].map((bucket) => ({
    label: bucket.label,
    count: animalRows.filter(
      (row) => row.variance !== null && row.variance > bucket.min && row.variance <= bucket.max
    ).length,
    color: bucket.bad ? BAD : NEUTRAL,
  }));

  // --- Intake trend and the drop flag --------------------------------------
  const herdSeries = dailyIntakeSeries(intake);
  const herdDrop = detectConsumptionDrop(herdSeries);

  const penDrops = pens
    .map((pen) => {
      const series = dailyIntakeSeries(
        intake.filter((record) => record.penId === pen.penId)
      );
      return { pen, series, drop: detectConsumptionDrop(series) };
    })
    .filter((row) => row.drop?.flagged)
    .sort((a, b) => (b.drop?.dropFraction ?? 0) - (a.drop?.dropFraction ?? 0));

  const totalFeedKg = roundKg(intake.reduce((sum, r) => sum + effectiveIntakeKg(r), 0));
  const totalFeedCostCents = intake.reduce(
    (sum, r) => sum + Math.round(effectiveIntakeKg(r) * (r.costPerKgCents ?? 0)),
    0
  );
  const totalGainKg = roundKg(
    [...gainByPig.values()].reduce((sum, gain) => sum + Math.max(0, gain.gainKg), 0)
  );
  const herdFcr = feedConversionRatio(totalFeedKg, totalGainKg);

  return (
    <div>
      <PageHeader
        title="Nutritional performance"
        description={`Feed conversion, growth and intake over the last ${windowDays} days.`}
      />

      <FeedSubnav active="/feed/analysis" role={user.role} />

      <Card className="mb-6">
        <form className="flex flex-wrap items-end gap-4" method="get">
          <Field label="Window" htmlFor="days" className="min-w-40">
            <Select id="days" name="days" defaultValue={String(windowDays)}>
              <option value="30">Last 30 days</option>
              <option value="60">Last 60 days</option>
              <option value="90">Last 90 days</option>
              <option value="180">Last 6 months</option>
              <option value="365">Last year</option>
            </Select>
          </Field>
          <SubmitButton variant="secondary" pendingLabel="Loading…">
            Apply
          </SubmitButton>
        </form>
      </Card>

      {herdDrop?.flagged || penDrops.length > 0 ? (
        <Card className="mb-6 border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30">
          <h2 className="mb-2 text-sm font-semibold text-red-900 dark:text-red-300">
            Feed intake has dropped
          </h2>
          <p className="mb-3 text-sm text-red-800 dark:text-red-400">
            A sustained fall in intake per animal is usually the first sign of illness, ahead of
            anything visible. Anything more than {Math.round(CONSUMPTION_DROP_THRESHOLD * 100)}%
            below the previous week is flagged here.
          </p>
          <ul className="space-y-1.5 text-sm">
            {herdDrop?.flagged ? (
              <li className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-red-900 dark:text-red-200">Whole herd</span>
                <span className="tabular-nums text-red-800 dark:text-red-300">
                  {formatKg(herdDrop.recentKgPerAnimal, 2)}/animal vs{" "}
                  {formatKg(herdDrop.baselineKgPerAnimal, 2)} baseline — down{" "}
                  {formatPercent(herdDrop.dropFraction, 0)}
                </span>
              </li>
            ) : null}
            {penDrops.map(({ pen, drop }) => (
              <li key={pen.penId} className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/pens/${pen.penId}`}
                  className="font-medium text-red-900 underline decoration-red-300 underline-offset-2 dark:text-red-200"
                >
                  {pen.penName}
                </Link>
                <span className="tabular-nums text-red-800 dark:text-red-300">
                  {formatKg(drop?.recentKgPerAnimal ?? 0, 2)}/animal vs{" "}
                  {formatKg(drop?.baselineKgPerAnimal ?? 0, 2)} baseline — down{" "}
                  {formatPercent(drop?.dropFraction ?? 0, 0)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Feed used"
          value={formatKg(totalFeedKg, 0)}
          hint={`${intake.length} feeding records`}
        />
        <StatTile label="Feed cost" value={formatCents(totalFeedCostCents)} />
        <StatTile
          label="Herd FCR"
          value={herdFcr === null ? "—" : herdFcr.toFixed(2)}
          hint="kg feed per kg gain — lower is better"
        />
        <StatTile
          label="Cost per kg gain"
          value={totalGainKg > 0 ? formatCents(Math.round(totalFeedCostCents / totalGainKg)) : "—"}
          hint={`${formatKg(totalGainKg, 0)} of liveweight gain`}
        />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <LineChart
            title="Daily intake per animal"
            description="Total feed divided by the animals it covered, so a sale out of a pen doesn't read as a drop."
            series={[
              {
                name: "kg per animal",
                points: herdSeries.map((point) => ({
                  label: point.day.slice(5).replace("-", "/"),
                  value: point.kgPerAnimal,
                })),
              },
            ]}
            formatValue={(value) => `${value.toFixed(2)}`}
            yZero
            emptyMessage="No feeding recorded in this window yet."
          />
        </Card>

        <Card>
          <BarChart
            title="Feed conversion by pen"
            description="kg of feed per kg of liveweight gain. Lower is better; the worst pen is flagged."
            data={ratedPens
              .sort((a, b) => (b.fcr ?? 0) - (a.fcr ?? 0))
              .map((row) => ({
                label: row.penName,
                value: row.fcr as number,
                hint: `${row.weighedCount} weighed`,
                color: (row.fcr as number) >= worstFcr && ratedPens.length > 1 ? BAD : GOOD,
              }))}
            formatValue={(value) => value.toFixed(2)}
            emptyMessage="Needs at least two weigh-ins per pen inside the window."
            footnote="Pens with only one weigh-in in the window are excluded rather than counted as zero gain."
          />
        </Card>

        <Card>
          <BarChart
            title="Average daily gain by stage"
            description="Mean kg/day across animals with two or more weigh-ins."
            data={stageSummary
              .filter((row) => row.adg !== null)
              .map((row) => ({
                label: LIFE_STAGE_LABELS[row.stage],
                value: row.adg as number,
                hint: `${row.animals} animals`,
              }))}
            formatValue={(value) => `${value.toFixed(2)} kg`}
            emptyMessage="No stage has two weigh-ins for an animal in this window."
          />
        </Card>

        <Card>
          <Histogram
            title="Weight against the reference curve"
            description="How far each animal sits above or below the expected weight for its age."
            buckets={varianceBuckets}
            xAxisLabel="Variance from expected weight"
            emptyMessage="No animals have a recorded current weight."
            footnote={`${slowGrowers.length} animal(s) more than ${Math.abs(SLOW_GROWER_VARIANCE) * 100}% below the curve.`}
          />
        </Card>
      </div>

      <Card className="mb-6">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Performance by stage
        </h2>
        {stageSummary.length === 0 ? (
          <EmptyState title="No live animals to report on" />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Stage</Th>
                <Th className="text-right">Animals</Th>
                <Th className="text-right">Feed</Th>
                <Th className="text-right">Gain</Th>
                <Th className="text-right">FCR</Th>
                <Th className="text-right">ADG</Th>
                <Th className="text-right">Cost / kg gain</Th>
              </Tr>
            </Thead>
            <Tbody>
              {stageSummary.map((row) => (
                <Tr key={row.stage}>
                  <Td className="font-medium">{LIFE_STAGE_LABELS[row.stage]}</Td>
                  <Td className="text-right tabular-nums">{row.animals}</Td>
                  <Td className="text-right tabular-nums">{formatKg(row.feedKg, 0)}</Td>
                  <Td className="text-right tabular-nums">{formatKg(row.gainKg, 0)}</Td>
                  <Td className="text-right tabular-nums">
                    {row.fcr === null ? "—" : row.fcr.toFixed(2)}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {row.adg === null ? "—" : `${row.adg.toFixed(2)} kg/d`}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {row.costPerKgGainCents === null ? "—" : formatCents(row.costPerKgGainCents)}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>

      <Card className="mb-6">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Performance by pen
        </h2>
        {penRows.length === 0 ? (
          <EmptyState title="No pens with feeding recorded in this window" />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Pen</Th>
                <Th className="text-right">Animals</Th>
                <Th className="text-right">Feed</Th>
                <Th className="text-right">Cost</Th>
                <Th className="text-right">Gain</Th>
                <Th className="text-right">FCR</Th>
                <Th className="text-right">Cost / kg gain</Th>
              </Tr>
            </Thead>
            <Tbody>
              {penRows.map((row) => (
                <Tr key={row.penId}>
                  <Td>
                    <Link
                      href={`/pens/${row.penId}`}
                      className="font-medium underline decoration-zinc-300 underline-offset-2 dark:decoration-zinc-700"
                    >
                      {row.penName}
                    </Link>
                  </Td>
                  <Td className="text-right tabular-nums">{row.animalCount}</Td>
                  <Td className="text-right tabular-nums">{formatKg(row.feedKg, 0)}</Td>
                  <Td className="text-right tabular-nums">{formatCents(row.feedCostCents)}</Td>
                  <Td className="text-right tabular-nums">{formatKg(row.gainKg, 0)}</Td>
                  <Td className="text-right tabular-nums">
                    {row.fcr === null ? (
                      <span className="text-zinc-400 dark:text-zinc-500">—</span>
                    ) : (
                      row.fcr.toFixed(2)
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {row.costPerKgGainCents === null ? "—" : formatCents(row.costPerKgGainCents)}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Animals furthest from the growth curve
        </h2>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          Sorted worst first. A slow grower is a feed, health or genetics question — this says which
          animals to ask it about.
        </p>
        {animalRows.length === 0 ? (
          <EmptyState title="No live animals to report on" />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Animal</Th>
                <Th>Stage</Th>
                <Th className="text-right">Age</Th>
                <Th className="text-right">Weight</Th>
                <Th className="text-right">Expected</Th>
                <Th className="text-right">Variance</Th>
                <Th className="text-right">ADG</Th>
                <Th className="text-right">FCR</Th>
              </Tr>
            </Thead>
            <Tbody>
              {animalRows.slice(0, 20).map((row) => (
                <Tr key={row.id}>
                  <Td>
                    <Link
                      href={`/animals/${row.id}`}
                      className="font-medium underline decoration-zinc-300 underline-offset-2 dark:decoration-zinc-700"
                    >
                      {row.tagNumber}
                      {row.name ? ` — ${row.name}` : ""}
                    </Link>
                    {row.penName ? (
                      <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                        {row.penName}
                      </span>
                    ) : null}
                  </Td>
                  <Td>{LIFE_STAGE_LABELS[row.stage]}</Td>
                  <Td className="text-right tabular-nums">{row.ageDays} d</Td>
                  <Td className="text-right tabular-nums">
                    {row.actualKg === null ? "—" : formatKg(row.actualKg)}
                  </Td>
                  <Td className="text-right tabular-nums">{formatKg(row.expectedKg)}</Td>
                  <Td className="text-right tabular-nums">
                    {row.variance === null ? (
                      "—"
                    ) : row.variance <= SLOW_GROWER_VARIANCE ? (
                      <Badge variant="danger">{formatPercent(row.variance, 0)}</Badge>
                    ) : (
                      formatPercent(row.variance, 0)
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {row.adg === null ? "—" : `${row.adg.toFixed(2)}`}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {row.fcr === null ? "—" : row.fcr.toFixed(2)}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
