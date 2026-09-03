import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { AnimalSelect } from "@/components/breeding/animal-select";
import { ScoreBreakdown } from "@/components/breeding/score-breakdown";
import { WarningList } from "@/components/breeding/warnings";
import { BAND_LABELS } from "@/components/breeding/match-card";
import { dateParam, firstParam } from "@/components/breeding/search-params";
import { requireRole, WRITE_ROLES } from "@/lib/auth";
import { getActiveFarmId, getFarmSettings } from "@/lib/active-farm";
import { addDays, formatDate, formatPercent, toDateInputValue } from "@/lib/format";
import { inbreedingBandVariant } from "@/lib/breeding/inbreeding";
import { BREEDING_METHOD_LABELS, optionsFrom } from "@/lib/labels";
import { checkMating, listBreedingCandidates } from "@/lib/db/breeding";
import { createBreedingRecord } from "@/app/breeding/actions";

/**
 * Record a mating.
 *
 * Two steps on purpose: pick the pair, *see what the engine thinks of it*, then
 * write it. The pairing check on this page is the same `checkMating` the Server
 * Action runs again before writing — the screen is a preview of the decision,
 * never the thing enforcing it, because this action is reachable by direct POST
 * and the match finder's UI must not be the only thing standing between a user
 * and a full-sib mating.
 */
export default async function NewBreedingPage({
  searchParams,
}: PageProps<"/breeding/new">) {
  const user = await requireRole(WRITE_ROLES);
  const farmId = await getActiveFarmId(user);
  const settings = await getFarmSettings(farmId);

  const params = await searchParams;
  const damId = firstParam(params.damId);
  const sireId = firstParam(params.sireId);
  const breedingDate = dateParam(params.breedingDate) ?? new Date();

  const [dams, sires] = await Promise.all([
    listBreedingCandidates(farmId, "FEMALE"),
    listBreedingCandidates(farmId, "MALE"),
  ]);

  const check =
    damId && sireId
      ? await checkMating({ farmId, damId, sireId, breedingDate, settings })
      : null;

  const blocked = check !== null && check.blockers.length > 0;
  const needsOverride = check !== null && !blocked && check.warnings.length > 0;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="Record a mating"
        description={`Expected farrowing is set to ${settings.gestationDays} days after the breeding date.`}
        actions={
          <ButtonLink href="/breeding/match-finder" variant="secondary">
            Open match finder
          </ButtonLink>
        }
      />

      <Card>
        <form method="get" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Dam" required>
              <AnimalSelect
                name="damId"
                animals={dams}
                defaultValue={damId ?? undefined}
                placeholder="Select a dam"
                required
              />
            </Field>
            <Field label="Sire" required>
              <AnimalSelect
                name="sireId"
                animals={sires}
                defaultValue={sireId ?? undefined}
                placeholder="Select a sire"
                required
              />
            </Field>
          </div>

          <Field
            label="Breeding date"
            htmlFor="check-breeding-date"
            hint="Age, weight and repeat-mating rules are all checked against this date."
          >
            <Input
              id="check-breeding-date"
              name="breedingDate"
              type="date"
              defaultValue={toDateInputValue(breedingDate)}
              max={toDateInputValue(new Date())}
            />
          </Field>

          <Button type="submit" variant="secondary">
            Check this pairing
          </Button>
        </form>
      </Card>

      {check ? (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                {check.dam?.tagNumber} × {check.sire?.tagNumber}
              </h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {check.relationshipLabel ?? "Relationship not established"} · expected farrowing{" "}
                {formatDate(addDays(breedingDate, settings.gestationDays))}
              </p>
            </div>
            {check.offspringInbreedingCoefficient !== null && check.band ? (
              <Badge variant={inbreedingBandVariant(check.band)}>
                Offspring F {formatPercent(check.offspringInbreedingCoefficient, 2)} ·{" "}
                {BAND_LABELS[check.band]}
              </Badge>
            ) : null}
          </div>

          {check.match && check.match.score !== null ? (
            <ScoreBreakdown components={check.match.components} score={check.match.score} />
          ) : null}

          <WarningList
            items={check.blockers}
            tone="danger"
            title="This mating cannot be recorded"
          />
          <WarningList items={check.warnings} title="Warnings — a reason is required to proceed" />

          {!blocked && check.warnings.length === 0 ? (
            <p className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
              No constraint problems found for this pairing.
            </p>
          ) : null}
        </Card>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Choose a dam and a sire to see the pedigree check before recording anything. Coming from
          the{" "}
          <Link href="/breeding/match-finder" className="underline">
            match finder
          </Link>{" "}
          fills both in for you.
        </p>
      )}

      {check && !blocked ? (
        <Card>
          <form action={createBreedingRecord} className="space-y-4">
            <input type="hidden" name="damId" value={damId ?? ""} />
            <input type="hidden" name="sireId" value={sireId ?? ""} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Breeding date" htmlFor="breedingDate" required>
                <Input
                  id="breedingDate"
                  name="breedingDate"
                  type="date"
                  required
                  defaultValue={toDateInputValue(breedingDate)}
                  max={toDateInputValue(new Date())}
                />
              </Field>

              <Field label="Method" htmlFor="method" required>
                <Select id="method" name="method" required defaultValue="NATURAL">
                  {optionsFrom(BREEDING_METHOD_LABELS).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {needsOverride ? (
              <Field
                label="Reason for proceeding despite the warnings"
                htmlFor="overrideReason"
                required
                hint="Stored on the record. A year from now this is the only explanation of why this pairing was chosen."
              >
                <Textarea id="overrideReason" name="overrideReason" rows={3} required />
              </Field>
            ) : null}

            <Field label="Notes" htmlFor="notes">
              <Textarea id="notes" name="notes" rows={3} />
            </Field>

            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton pendingLabel="Recording...">Record mating</SubmitButton>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Every constraint is re-checked on the server against the date you submit.
              </span>
            </div>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
