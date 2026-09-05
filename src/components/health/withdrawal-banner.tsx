import { formatDate } from "@/lib/format";
import type { WithdrawalStatus } from "@/lib/health/withdrawal";

/**
 * The food-safety banner (§8.3).
 *
 * Deliberately loud and deliberately always present: when an animal is clear
 * it says so in green, because "no banner" and "I forgot to check" look
 * identical to the person about to load a lorry. The sale itself is blocked
 * server-side by `assertAnimalsMayBeSold` — this is the warning that stops
 * somebody getting that far.
 */
export function WithdrawalBanner({
  status,
  tagNumber,
}: {
  status: WithdrawalStatus;
  tagNumber: string;
}) {
  if (!status.inWithdrawal) {
    if (status.clearanceDate === null) {
      return (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          No medication with a withdrawal period recorded for animal {tagNumber}.
        </div>
      );
    }
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
        <span className="font-semibold">Clear of withdrawal.</span> Animal {tagNumber} last cleared on{" "}
        {formatDate(status.clearanceDate)} and may be sold or slaughtered.
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
    >
      <p className="font-semibold">
        Do not sell or slaughter — animal {tagNumber} is within a medication withdrawal period.
      </p>
      <p className="mt-1">
        Clear from <span className="font-medium">{formatDate(status.clearanceDate)}</span> (
        {status.daysRemaining} day{status.daysRemaining === 1 ? "" : "s"} remaining).
      </p>
      <ul className="mt-2 space-y-0.5">
        {status.blockingMedications.map((medication) => (
          <li key={`${medication.drugName}-${medication.clearanceDate.toISOString()}`}>
            {medication.drugName} — course ended {formatDate(medication.courseEndDate)},{" "}
            {medication.withdrawalDays}-day withdrawal, clear{" "}
            {formatDate(medication.clearanceDate)}
          </li>
        ))}
      </ul>
    </div>
  );
}
