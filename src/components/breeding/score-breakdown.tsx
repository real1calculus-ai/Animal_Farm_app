import type { MatchComponents } from "@/lib/breeding/match-finder";

/**
 * The four weighted components of a match score, drawn as one stacked bar with
 * the workload penalty hatched off the end.
 *
 * Plain CSS — no chart library. The bar is 100 units wide because the score is
 * out of 100, so a segment's width *is* its contribution to the headline
 * number, and the point where the hatching starts *is* the final score. A user
 * who does not trust the recommendation can read every term off the picture.
 *
 * The weights mirror the engine's (§4.2): genetic distance 40%, diversity 30%,
 * phenotype 20%, health 10%. They are listed here only to label the bar; the
 * arithmetic itself belongs to `match-finder.ts` and is never redone.
 */

const PARTS = [
  {
    key: "geneticDistance",
    label: "Genetic distance",
    weight: 0.4,
    bar: "bg-emerald-500 dark:bg-emerald-500",
    dot: "bg-emerald-500",
    hint: "(1 − F) — how unrelated the pairing is",
  },
  {
    key: "diversity",
    label: "Diversity potential",
    weight: 0.3,
    bar: "bg-sky-500 dark:bg-sky-500",
    dot: "bg-sky-500",
    hint: "how little of their ancestry overlaps",
  },
  {
    key: "phenotype",
    label: "Phenotype match",
    weight: 0.2,
    bar: "bg-violet-500 dark:bg-violet-500",
    dot: "bg-violet-500",
    hint: "breed, condition score, recorded defects",
  },
  {
    key: "health",
    label: "Health history",
    weight: 0.1,
    bar: "bg-amber-500 dark:bg-amber-500",
    dot: "bg-amber-500",
    hint: "last 12 months of illness and injury",
  },
] as const;

export function ScoreBreakdown({
  components,
  score,
}: {
  components: MatchComponents;
  score: number;
}) {
  const contributions = PARTS.map((part) => ({
    ...part,
    raw: components[part.key],
    value: components[part.key] * part.weight,
  }));

  const weighted = contributions.reduce((total, part) => total + part.value, 0);
  const penalty = Math.min(components.loadPenalty, weighted);

  return (
    <div className="space-y-2">
      <div
        className="relative flex h-4 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
        role="img"
        aria-label={contributions
          .map((part) => `${part.label} ${part.value.toFixed(1)} of ${(part.weight * 100).toFixed(0)}`)
          .concat(`workload penalty ${penalty.toFixed(1)}`, `total ${score.toFixed(1)} out of 100`)
          .join(", ")}
      >
        {contributions.map((part) => (
          <div
            key={part.key}
            className={part.bar}
            style={{ width: `${part.value}%` }}
            title={`${part.label}: ${part.value.toFixed(1)} points`}
          />
        ))}
        {penalty > 0 ? (
          <div
            className="absolute inset-y-0 border-l border-red-600/70"
            style={{
              left: `${weighted - penalty}%`,
              width: `${penalty}%`,
              backgroundImage:
                "repeating-linear-gradient(45deg, rgba(220,38,38,0.85) 0, rgba(220,38,38,0.85) 3px, rgba(220,38,38,0.35) 3px, rgba(220,38,38,0.35) 6px)",
            }}
            title={`Sire workload penalty: −${penalty.toFixed(1)} points`}
          />
        ) : null}
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
        {contributions.map((part) => (
          <div key={part.key} className="flex items-baseline gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${part.dot}`} aria-hidden="true" />
            <dt className="text-zinc-600 dark:text-zinc-400">
              {part.label}{" "}
              <span className="text-zinc-400 dark:text-zinc-500">
                ({(part.weight * 100).toFixed(0)}% of {part.raw.toFixed(0)})
              </span>
            </dt>
            <dd className="ml-auto font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
              +{part.value.toFixed(1)}
            </dd>
          </div>
        ))}
        <div className="flex items-baseline gap-2">
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-red-600"
            aria-hidden="true"
          />
          <dt className="text-zinc-600 dark:text-zinc-400">
            Workload penalty{" "}
            <span className="text-zinc-400 dark:text-zinc-500">(applied after weighting)</span>
          </dt>
          <dd className="ml-auto font-medium tabular-nums text-red-700 dark:text-red-400">
            −{components.loadPenalty.toFixed(1)}
          </dd>
        </div>
        <div className="flex items-baseline gap-2 border-t border-zinc-200 pt-1 dark:border-zinc-800 sm:col-span-2">
          <dt className="font-medium text-zinc-800 dark:text-zinc-200">Total</dt>
          <dd className="ml-auto font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
            {score.toFixed(1)} / 100
          </dd>
        </div>
      </dl>
    </div>
  );
}
