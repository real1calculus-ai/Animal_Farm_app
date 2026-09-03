/**
 * Blockers and warnings are rendered the same way everywhere they appear — the
 * match finder, the pairing check on `/breeding/new`, the dam summary — because
 * a user should not have to work out from the styling whether the thing they
 * are reading stops them or merely cautions them.
 */
export function WarningList({
  items,
  tone = "warning",
  title,
}: {
  items: string[];
  tone?: "warning" | "danger";
  title?: string;
}) {
  if (items.length === 0) return null;

  const classes =
    tone === "danger"
      ? "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
      : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300";

  return (
    <div className={`rounded-md border px-4 py-3 text-sm ${classes}`} role="alert">
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      <ul className="list-disc space-y-1 pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
