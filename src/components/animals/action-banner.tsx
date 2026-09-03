import type { AnimalActionState } from "@/components/animals/form-state";

/** Inline result banner for the on-page forms — a refusal has to say *why*
 *  next to the form that caused it, not replace the page with an error. */
export function ActionBanner({ state }: { state: AnimalActionState }) {
  if (state.error) {
    return (
      <p
        role="alert"
        className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300"
      >
        {state.error}
      </p>
    );
  }

  if (state.success) {
    return (
      <p
        role="status"
        className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300"
      >
        {state.success}
      </p>
    );
  }

  return null;
}
