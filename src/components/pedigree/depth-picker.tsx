import Link from "next/link";

const DEPTHS = [3, 4, 5];

/**
 * Generation-depth switcher. Plain links rather than a control with state —
 * the depth belongs in the URL so a particular view of a pedigree can be sent
 * to someone else.
 */
export function DepthPicker({ animalId, depth }: { animalId: string; depth: number }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Generations shown">
      <span className="mr-1 text-xs text-zinc-500 dark:text-zinc-400">Generations</span>
      {DEPTHS.map((value) => (
        <Link
          key={value}
          href={`/animals/${animalId}/pedigree?depth=${value}`}
          aria-current={value === depth ? "true" : undefined}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            value === depth
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          }`}
        >
          {value}
        </Link>
      ))}
    </div>
  );
}
