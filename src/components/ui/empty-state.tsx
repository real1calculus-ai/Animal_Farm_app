import type { ReactNode } from "react";

/**
 * Shown in place of an empty table. Always says what the screen would hold and
 * offers the action that fills it — a bare "No results" leaves a new user with
 * nowhere to go on a farm that hasn't been set up yet.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-zinc-300 px-6 py-12 text-center dark:border-zinc-700">
      <p className="font-medium text-zinc-800 dark:text-zinc-200">{title}</p>
      {description ? (
        <p className="max-w-md text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
      ) : null}
      {action}
    </div>
  );
}
