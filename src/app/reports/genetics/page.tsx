import Link from "next/link";

import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ReportShell, ReportSection } from "@/components/reports/report-shell";
import { resolveDateRange } from "@/components/reports/date-range";
import { BarChart, Histogram, LineChart } from "@/components/charts";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getActiveFarmId, getFarmSettings } from "@/lib/active-farm";
import { ancestorsOf, loadPedigreeIndex } from "@/lib/breeding/pedigree";
import {
  createInbreedingCalculator,
  inbreedingBand,
  inbreedingBandVariant,
  pedigreeCompleteness,
} from "@/lib/breeding/inbreeding";
import { formatPercent } from "@/lib/format";

/** F buckets for the herd histogram, as fractions. */
const BANDS = [0, 0.0125, 0.025, 0.05, 0.075, 0.1, 0.15, 0.25];

export default async function GeneticsReportPage({ searchParams }: PageProps<"/reports/genetics">) {
  const user = await requireUser();
  const farmId = await getActiveFarmId(user);
  const settings = await getFarmSettings(farmId);
  await searchParams;
  const range = resolveDateRange({});

  const [index, active] = await Promise.all([
    loadPedigreeIndex(farmId),
    prisma.pig.findMany({
      where: { farmId, status: "ACTIVE" },
      select: { id: true, tagNumber: true, name: true, dateOfBirth: true, breed: true },
    }),
  ]);

  if (active.length === 0) {
    return (
      <ReportShell
        title="Genetic diversity"
        decision="Whether the herd is quietly closing its own gene pool, and when to bring in new blood."
        path="/reports/genetics"
        range={range}
      >
        <EmptyState
          title="No active animals yet"
          description="Genetic diversity analysis needs a herd with recorded parentage."
        />
      </ReportShell>
    );
  }

  const calculator = createInbreedingCalculator(index);

  const scored = active
    .map((pig) => ({
      ...pig,
      f: calculator.inbreedingOf(pig.id),
      completeness: pedigreeCompleteness(index, pig.id),
      birthYear: pig.dateOfBirth.getUTCFullYear(),
    }))
    .sort((a, b) => b.f - a.f);

  const herdF = scored.reduce((sum, pig) => sum + pig.f, 0) / scored.length;
  const avgCompleteness =
    scored.reduce((sum, pig) => sum + pig.completeness, 0) / scored.length;

  // Histogram of F across the herd.
  const buckets = BANDS.slice(0, -1).map((lower, i) => {
    const upper = BANDS[i + 1];
    return {
      label: `${(lower * 100).toFixed(1)}–${(upper * 100).toFixed(1)}%`,
      count: scored.filter((pig) => pig.f >= lower && pig.f < upper).length,
    };
  });
  buckets.push({
    label: `${(BANDS[BANDS.length - 1] * 100).toFixed(0)}%+`,
    count: scored.filter((pig) => pig.f >= BANDS[BANDS.length - 1]).length,
  });

  // Average F by birth year. This is the number that says whether the herd is
  // narrowing: a rising line means each generation is more related than the
  // last, which no single mating's coefficient would ever reveal.
  const byYear = new Map<number, { total: number; count: number }>();
  for (const pig of scored) {
    const entry = byYear.get(pig.birthYear) ?? { total: 0, count: 0 };
    entry.total += pig.f;
    entry.count += 1;
    byYear.set(pig.birthYear, entry);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);

  // Founder contribution: how much of the herd descends from each ancestor.
  const contributions = new Map<string, number>();
  for (const pig of scored) {
    for (const ancestorId of ancestorsOf(index, pig.id).keys()) {
      contributions.set(ancestorId, (contributions.get(ancestorId) ?? 0) + 1);
    }
  }

  const topAncestors = [...contributions.entries()]
    .map(([id, count]) => ({
      id,
      node: index.get(id),
      share: count / scored.length,
    }))
    .filter((row) => row.node)
    .sort((a, b) => b.share - a.share)
    .slice(0, 10);

  // Effective population size, from the standard Ne = 4·Nm·Nf / (Nm + Nf).
  // A crude estimate — it assumes random mating and equal contribution — but
  // the order of magnitude is what matters, and it is the figure conservation
  // guidance is written against.
  const breedingMales = await prisma.pig.count({
    where: { farmId, sex: "MALE", status: "ACTIVE", breedingsAsSire: { some: {} } },
  });
  const breedingFemales = await prisma.pig.count({
    where: { farmId, sex: "FEMALE", status: "ACTIVE", breedingsAsDam: { some: {} } },
  });
  const effectivePopulation =
    breedingMales > 0 && breedingFemales > 0
      ? (4 * breedingMales * breedingFemales) / (breedingMales + breedingFemales)
      : null;

  const dominant = topAncestors.filter((row) => row.share >= 0.5);

  return (
    <ReportShell
      title="Genetic diversity"
      decision="Whether the herd is quietly closing its own gene pool, and when to bring in new blood."
      path="/reports/genetics"
      range={range}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Herd average F"
          value={formatPercent(herdF)}
          hint={`Warn at ${formatPercent(settings.warnInbreedingCoefficient)}, limit ${formatPercent(settings.maxInbreedingCoefficient)}`}
        />
        <StatTile
          label="Above the limit"
          value={String(scored.filter((pig) => pig.f > settings.maxInbreedingCoefficient).length)}
          hint={`of ${scored.length} active animals`}
        />
        <StatTile
          label="Effective population"
          value={effectivePopulation === null ? "—" : effectivePopulation.toFixed(1)}
          hint={`${breedingMales} boars × ${breedingFemales} sows in service`}
        />
        <StatTile
          label="Pedigree completeness"
          value={formatPercent(avgCompleteness, 0)}
          hint="Four generations back, averaged"
        />
      </div>

      {/*
        The caveat has to sit above the numbers, not below them. Every
        coefficient on this page assumes unknown parents are unrelated, which
        biases F downward — so on a sparsely recorded herd these figures are a
        floor, not an estimate, and reading them as reassurance is exactly the
        mistake that lets a gene pool close unnoticed.
      */}
      {avgCompleteness < 0.5 ? (
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40">
          <p className="text-sm text-amber-900 dark:text-amber-200">
            <strong>Read these figures as a floor, not an estimate.</strong> Pedigree completeness
            averages {formatPercent(avgCompleteness, 0)}, and every coefficient here assumes an
            unrecorded parent is unrelated to everything else. Real relatedness is therefore at
            least this high and probably higher. Recording known parentage is the single change
            that most improves this page.
          </p>
        </Card>
      ) : null}

      {dominant.length > 0 ? (
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40">
          <p className="text-sm text-amber-900 dark:text-amber-200">
            <strong>Diversity is narrowing.</strong>{" "}
            {dominant.length === 1
              ? `${dominant[0].node!.tagNumber} appears in the ancestry of ${formatPercent(dominant[0].share, 0)} of the active herd.`
              : `${dominant.length} ancestors each appear in over half the active herd's ancestry.`}{" "}
            Introducing unrelated breeding stock is the usual remedy — the alternative is a slow
            rise in F that no individual mating decision will ever show you.
          </p>
        </Card>
      ) : null}

      <ReportSection
        title="Inbreeding across the herd"
        description="How many active animals sit in each coefficient band."
      >
        <Histogram
          title=""
          buckets={buckets.map((bucket) => ({ label: bucket.label, count: bucket.count }))}
          emptyMessage="No animals to plot."
        />
      </ReportSection>

      <ReportSection
        title="Average inbreeding by birth year"
        description="A rising line means each generation is more related than the last. This is the trend that matters; a single animal's coefficient never shows it."
      >
        <LineChart
          title=""
          yZero
          series={[
            {
              name: "Average F",
              points: years.map((year) => {
                const entry = byYear.get(year)!;
                return { label: String(year), value: entry.total / entry.count };
              }),
            },
          ]}
          formatValue={(value) => formatPercent(value)}
          emptyMessage="Not enough birth-year spread yet."
        />
      </ReportSection>

      <ReportSection
        title="Ancestor contribution"
        description="Share of the active herd carrying each ancestor somewhere in its pedigree."
      >
        <BarChart
          title=""
          max={1}
          data={topAncestors.map((row) => ({
            label: row.node!.name ? `${row.node!.tagNumber} (${row.node!.name})` : row.node!.tagNumber,
            value: row.share,
          }))}
          formatValue={(value) => formatPercent(value, 0)}
          emptyMessage="No recorded ancestry yet."
        />
      </ReportSection>

      <ReportSection
        title="Most inbred animals"
        description="Consider these first when deciding what to cull or which lines to stop breeding from."
      >
        <Card className="p-0">
          <Table>
            <Thead>
              <Tr>
                <Th>Tag</Th>
                <Th>Breed</Th>
                <Th className="text-right">F</Th>
                <Th className="text-right">Pedigree known</Th>
                <Th>Band</Th>
              </Tr>
            </Thead>
            <Tbody>
              {scored.slice(0, 15).map((pig) => {
                const band = inbreedingBand(
                  pig.f,
                  settings.warnInbreedingCoefficient,
                  settings.maxInbreedingCoefficient
                );
                return (
                  <Tr key={pig.id}>
                    <Td>
                      <Link
                        href={`/animals/${pig.id}/pedigree`}
                        className="underline underline-offset-2"
                      >
                        {pig.tagNumber}
                      </Link>
                      {pig.name ? (
                        <span className="ml-1 text-xs text-zinc-500 dark:text-zinc-400">
                          {pig.name}
                        </span>
                      ) : null}
                    </Td>
                    <Td>{pig.breed}</Td>
                    <Td className="text-right tabular-nums">{formatPercent(pig.f)}</Td>
                    <Td className="text-right tabular-nums">{formatPercent(pig.completeness, 0)}</Td>
                    <Td>
                      <Badge variant={inbreedingBandVariant(band)}>{band}</Badge>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </Card>
      </ReportSection>
    </ReportShell>
  );
}
