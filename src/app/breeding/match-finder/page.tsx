import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { AnimalSelect } from "@/components/breeding/animal-select";
import { ExcludedBoars } from "@/components/breeding/excluded-boars";
import { BAND_LABELS, MatchCard } from "@/components/breeding/match-card";
import { WarningList } from "@/components/breeding/warnings";
import { firstParam } from "@/components/breeding/search-params";
import { requireUser } from "@/lib/auth";
import { getActiveFarmId, getFarmSettings } from "@/lib/active-farm";
import { formatPercent } from "@/lib/format";
import { formatAgeFromDays } from "@/components/breeding/age";
import { inbreedingBand, inbreedingBandVariant } from "@/lib/breeding/inbreeding";
import { findMatchesForDam, type MatchFinderResult } from "@/lib/breeding/match-finder";
import { listBreedingCandidates } from "@/lib/db/breeding";

/**
 * The breeding match finder (§4.2).
 *
 * All of the thinking lives in `findMatchesForDam`; this screen's job is to
 * make the result *auditable*. Every number the engine produced is on the page —
 * the four weighted components, the workload penalty, F with its band, the
 * relationship, pedigree completeness, sire workload and conception rate — and
 * the boars that were refused are listed with their reasons rather than being
 * quietly dropped.
 */
export default async function MatchFinderPage({
  searchParams,
}: PageProps<"/breeding/match-finder">) {
  const user = await requireUser();
  const farmId = await getActiveFarmId(user);
  const settings = await getFarmSettings(farmId);

  const params = await searchParams;
  const damId = firstParam(params.damId);

  const dams = await listBreedingCandidates(farmId, "FEMALE");

  let result: MatchFinderResult | null = null;
  let failure: string | null = null;

  if (damId) {
    try {
      result = await findMatchesForDam(farmId, damId, settings);
    } catch (error) {
      failure = error instanceof Error ? error.message : "Could not evaluate this dam.";
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Breeding match finder"
        description={
          result
            ? `Every active ${result.dam.terms.male} is scored against her pedigree, phenotype, health history and workload.`
            : "Pick a female; every eligible male is scored against her pedigree, phenotype, health history and workload."
        }
        actions={<ButtonLink href="/breeding" variant="secondary">Breeding records</ButtonLink>}
      />

      <Card>
        <form method="get" className="space-y-4">
          <Field
            label="Dam"
            hint="Active females only. Search by tag number, name or breed."
            required
          >
            <AnimalSelect
              name="damId"
              animals={dams}
              defaultValue={damId ?? undefined}
              placeholder="Select a dam"
              required
            />
          </Field>
          <Button type="submit">Find matches</Button>
        </form>
      </Card>

      {dams.length === 0 ? (
        <EmptyState
          title="No active females on the farm"
          description="Register breeding females before looking for matches."
          action={<ButtonLink href="/animals/new">Add an animal</ButtonLink>}
        />
      ) : null}

      {failure ? <WarningList items={[failure]} tone="danger" title="Cannot score this dam" /> : null}

      {result ? <MatchResults result={result} settings={settings} /> : null}
    </div>
  );
}

function MatchResults({
  result,
  settings,
}: {
  result: MatchFinderResult;
  settings: { warnInbreedingCoefficient: number; maxInbreedingCoefficient: number };
}) {
  const { dam } = result;
  const damBand = inbreedingBand(
    dam.inbreedingCoefficient,
    settings.warnInbreedingCoefficient,
    settings.maxInbreedingCoefficient
  );

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {dam.tagNumber}
              {dam.name ? <span className="font-normal text-zinc-500"> — {dam.name}</span> : null}
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {dam.breed} · {formatAgeFromDays(dam.ageDays)} old
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={inbreedingBandVariant(damBand)}>
              Her own F {formatPercent(dam.inbreedingCoefficient)} · {BAND_LABELS[damBand]}
            </Badge>
            <Badge variant={dam.pedigreeCompleteness < 0.5 ? "warning" : "default"}>
              Pedigree {formatPercent(dam.pedigreeCompleteness, 0)} recorded
            </Badge>
            <Link
              href={`/animals/${dam.id}/pedigree`}
              className="text-sm text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              View pedigree
            </Link>
          </div>
        </div>

        {dam.pedigreeCompleteness < 0.5 ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Only {formatPercent(dam.pedigreeCompleteness, 0)} of her four-generation ancestry is
            recorded — an unknown ancestor is assumed unrelated, so every F below may understate the
            true relatedness.
          </p>
        ) : null}

        <WarningList
          items={result.damWarnings}
          tone="danger"
          title="This dam is not ready to be bred"
        />
      </Card>

      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Recommended boars ({result.matches.length})
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Genetic distance 40% · diversity 30% · phenotype 20% · health 10%, less a sire-workload
            penalty of up to 15 points
          </p>
        </div>

        {result.matches.length === 0 ? (
          <EmptyState
            title={`No eligible ${result.dam.terms.male}s for this ${result.dam.terms.female}`}
            description={
              result.excluded.length > 0
                ? `Every active ${result.dam.terms.male} was excluded. Open the list below to see why — introducing unrelated genetics may be the only way forward.`
                : `There are no active ${result.dam.terms.male}s of breeding age on this farm yet.`
            }
          />
        ) : (
          result.matches.map((match, index) => (
            <MatchCard key={match.sireId} match={match} damId={result.dam.id} rank={index + 1} />
          ))
        )}
      </section>

      <ExcludedBoars excluded={result.excluded} />
    </div>
  );
}
