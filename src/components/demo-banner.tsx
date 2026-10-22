import { DEMO_MODE, DEMO_RESET_HOURS } from "@/lib/demo";

/**
 * A persistent strip saying this is a demo and the records are invented.
 *
 * Deliberately not dismissible. Someone who lands mid-session on a page of
 * livestock records should never be left wondering whether they are looking
 * at a real farm's animals, and a banner they closed three screens ago does
 * not answer that.
 */
export function DemoBanner() {
  if (!DEMO_MODE) return null;

  return (
    <div className="border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      <strong>Demo.</strong> Every animal, treatment and figure here is
      invented. Changes you make are real and visible to other visitors, and
      everything resets every {DEMO_RESET_HOURS} hours.
    </div>
  );
}
