import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatAge, formatKg } from "@/lib/format";
import { inbreedingBandVariant, type InbreedingBand } from "@/lib/breeding/inbreeding";
import type { SireMatch } from "@/lib/breeding/match-finder";
import { ScoreBreakdown } from "@/components/breeding/score-breakdown";
import { WarningList } from "@/components/breeding/warnings";

export const BAND_LABELS: Record<InbreedingBand, string> = {
  NONE: "No shared ancestry",
  LOW: "Low inbreeding risk",
  MODERATE: "Moderate inbreeding risk",
  HIGH: "High inbreeding risk",
};

/** One recommended boar, in rank order. */
export function MatchCard({
  match,
  damId,
  rank,
}: {
  match: SireMatch;
  damId: string;
  rank: number;
}) {
  const score = match.score ?? 0;

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500">#{rank}</span>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {match.tagNumber}
              {match.name ? <span className="font-normal text-zinc-500"> — {match.name}</span> : null}
            </h3>
            <Badge variant={inbreedingBandVariant(match.band)}>
              F {(match.inbreedingCoefficient * 100).toFixed(1)}% · {BAND_LABELS[match.band]}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {match.breed} · {formatAge(new Date(Date.now() - match.ageDays * 86_400_000))} old ·{" "}
            {formatKg(match.currentWeightKg)} · {match.relationshipLabel}
          </p>
        </div>

        <div className="text-right">
          <div className="text-3xl font-semibold leading-none tabular-nums text-zinc-900 dark:text-zinc-50">
            {score.toFixed(1)}
            <span className="text-base font-normal text-zinc-400 dark:text-zinc-500">/100</span>
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">compatibility</p>
        </div>
      </div>

      <p className="text-sm text-zinc-700 dark:text-zinc-300">{match.explanation}</p>

      <ScoreBreakdown components={match.components} score={score} />

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        <Meta
          label="Pedigree recorded"
          value={`${(match.pedigreeCompleteness * 100).toFixed(0)}%`}
          hint={match.pedigreeCompleteness < 0.5 ? "F may understate relatedness" : undefined}
        />
        <Meta label="Breedings, last year" value={String(match.breedingsLastYear)} />
        <Meta
          label="Conception rate"
          value={
            match.conceptionRate === null
              ? "Not enough history"
              : `${(match.conceptionRate * 100).toFixed(0)}%`
          }
        />
        <Meta label="Offspring F" value={`${(match.inbreedingCoefficient * 100).toFixed(2)}%`} />
      </dl>

      <WarningList items={match.warnings} title="Proceed only with a reason" />

      <div className="flex justify-end">
        <ButtonLink href={`/breeding/new?damId=${damId}&sireId=${match.sireId}`}>
          Record this mating
        </ButtonLink>
      </div>
    </Card>
  );
}

function Meta({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="font-medium text-zinc-900 dark:text-zinc-100">{value}</dd>
      {hint ? <p className="text-[11px] text-amber-700 dark:text-amber-400">{hint}</p> : null}
    </div>
  );
}
