import { Spinner } from "@/components/ui/spinner";

/**
 * Shown while a route segment streams in. Deliberately plain: on a phone in a
 * barn on a slow connection the useful signal is "it is working", and a
 * skeleton that guesses at a layout it does not know only flashes a shape that
 * is then replaced by a different one.
 */
export default function Loading() {
  return (
    <div
      className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-zinc-500 dark:text-zinc-400"
      role="status"
      aria-live="polite"
    >
      <Spinner className="h-6 w-6" />
      <p className="text-sm">Loading…</p>
    </div>
  );
}
