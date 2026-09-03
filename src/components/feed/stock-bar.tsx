/**
 * Stock level against its reorder line, as a CSS bar.
 *
 * The reorder mark is drawn *on* the track rather than written underneath it,
 * because the only question the inventory screen has to answer at a glance is
 * "am I under the line". Expired stock is shown as a separate grey segment
 * after the usable stock: it is physically in the store, so hiding it would
 * misreport the shelf, but it must never read as cover.
 */
export function StockBar({
  usableKg,
  reorderLevelKg = 0,
  expiredKg = 0,
  capacityKg = null,
}: {
  usableKg: number;
  reorderLevelKg?: number;
  expiredKg?: number;
  capacityKg?: number | null;
}) {
  const scaleMax = Math.max(usableKg + expiredKg, capacityKg ?? 0, reorderLevelKg * 1.5, 1);
  const pct = (kg: number) => Math.min(100, Math.max(0, (kg / scaleMax) * 100));
  const below = reorderLevelKg > 0 && usableKg < reorderLevelKg;

  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
      <div
        className={`absolute inset-y-0 left-0 ${below ? "bg-red-500" : "bg-emerald-500"}`}
        style={{ width: `${pct(usableKg)}%` }}
      />
      {expiredKg > 0 ? (
        <div
          className="absolute inset-y-0 bg-zinc-400 dark:bg-zinc-600"
          style={{ left: `${pct(usableKg)}%`, width: `${pct(expiredKg)}%` }}
          title={`${expiredKg.toFixed(1)} kg expired`}
        />
      ) : null}
      {reorderLevelKg > 0 ? (
        <div
          className="absolute inset-y-0 w-0.5 bg-zinc-900 dark:bg-zinc-100"
          style={{ left: `${pct(reorderLevelKg)}%` }}
          title={`Reorder level ${reorderLevelKg.toFixed(0)} kg`}
        />
      ) : null}
    </div>
  );
}
