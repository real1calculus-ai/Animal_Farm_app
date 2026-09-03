import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatPercent } from "@/lib/format";
import { inbreedingBand, inbreedingBandVariant } from "@/lib/breeding/inbreeding";

const BAND_LABELS = {
  NONE: "No recorded inbreeding",
  LOW: "Low",
  MODERATE: "Moderate",
  HIGH: "High",
} as const;

/**
 * F and pedigree completeness, deliberately in one tile.
 *
 * Unknown ancestors are treated as unrelated founders, which biases F
 * downward — so a low F on a shallow pedigree means "we don't know", not
 * "unrelated". Showing the two numbers apart is what lets someone read the
 * first as reassurance; showing them together is the whole point.
 */
export function InbreedingSummary({
  coefficient,
  completeness,
  generations,
  warnThreshold,
  maxThreshold,
}: {
  coefficient: number;
  completeness: number;
  generations: number;
  warnThreshold: number;
  maxThreshold: number;
}) {
  const band = inbreedingBand(coefficient, warnThreshold, maxThreshold);
  const thin = completeness < 0.5;

  return (
    <Card className="flex flex-col gap-3 sm:col-span-2">
      <div className="flex flex-wrap items-start gap-x-10 gap-y-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            Inbreeding coefficient (F)
          </span>
          <span className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            {formatPercent(coefficient, 2)}
          </span>
          <span>
            <Badge variant={inbreedingBandVariant(band)}>{BAND_LABELS[band]}</Badge>
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">Pedigree completeness</span>
          <span className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            {formatPercent(completeness, 0)}
          </span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            of {generations}-generation ancestor slots filled
          </span>
        </div>
      </div>

      <p
        className={
          thin
            ? "text-xs font-medium text-amber-700 dark:text-amber-400"
            : "text-xs text-zinc-500 dark:text-zinc-400"
        }
      >
        {thin
          ? `Only ${formatPercent(completeness, 0)} of this animal's ancestry is recorded. Unknown ancestors are assumed unrelated, so F is a floor, not a measurement — treat ${formatPercent(coefficient, 2)} as "not yet known" rather than "safe to breed".`
          : `Warn above ${formatPercent(warnThreshold, 0)}, blocked above ${formatPercent(maxThreshold, 0)} by this farm's settings.`}
      </p>
    </Card>
  );
}
