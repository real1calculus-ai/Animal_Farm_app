import Link from "next/link";
import { formatDate, formatPercent } from "@/lib/format";
import { inbreedingBand, type InbreedingBand } from "@/lib/breeding/inbreeding";
import type { PedigreeTreeNode } from "@/lib/breeding/pedigree";

/**
 * The family tree, as a CSS grid.
 *
 * Generation `d` occupies column `d + 1` and holds 2^d slots, each spanning
 * 2^(generations - d) rows — which is what makes every ancestor line up
 * vertically with the pair it came from, without a layout library. Connectors
 * are one-pixel divs: a stub on each child's left edge and a bracket on the
 * parent's right edge, spanning exactly the gap between its two children's
 * centres.
 *
 * No charting or graph dependency, on purpose. The whole thing is static
 * markup that renders on the server, which is the only version of this screen
 * that opens quickly on a phone in a barn.
 */

const BAND_BORDER: Record<InbreedingBand, string> = {
  NONE: "border-l-emerald-500",
  LOW: "border-l-zinc-400 dark:border-l-zinc-500",
  MODERATE: "border-l-amber-500",
  HIGH: "border-l-red-500",
};

const BAND_LABEL: Record<InbreedingBand, string> = {
  NONE: "F = 0",
  LOW: "Low F",
  MODERATE: "Moderate F",
  HIGH: "High F",
};

type Slot = { node: PedigreeTreeNode; depth: number; index: number };

/** Walks the tree into (depth, index) slots — index is the position within the
 *  generation, counting dam-first, which is what keeps the rows aligned. */
function flatten(node: PedigreeTreeNode | null, depth: number, index: number, out: Slot[]): void {
  if (!node) return;
  out.push({ node, depth, index });
  flatten(node.mother, depth + 1, index * 2, out);
  flatten(node.father, depth + 1, index * 2 + 1, out);
}

export function PedigreeTree({
  root,
  generations,
  coefficients,
  warnThreshold,
  maxThreshold,
}: {
  root: PedigreeTreeNode;
  generations: number;
  /** F per known animal id, computed once by the page. */
  coefficients: Record<string, number>;
  warnThreshold: number;
  maxThreshold: number;
}) {
  const slots: Slot[] = [];
  flatten(root, 0, 0, slots);

  const columns = generations + 1;
  const totalRows = 2 ** generations;

  return (
    <div className="w-full overflow-x-auto">
      <div
        className="grid gap-x-6"
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(160px, 1fr))`,
          gridTemplateRows: `repeat(${totalRows}, minmax(56px, auto))`,
          minWidth: `${columns * 176}px`,
        }}
      >
        {slots.map(({ node, depth, index }) => {
          const span = 2 ** (generations - depth);
          const f = node.id ? (coefficients[node.id] ?? 0) : null;
          const band = f === null ? null : inbreedingBand(f, warnThreshold, maxThreshold);

          return (
            <div
              key={`${depth}-${index}`}
              className="relative flex items-center"
              style={{
                gridColumn: depth + 1,
                gridRow: `${index * span + 1} / span ${span}`,
              }}
            >
              {/* Stub joining this node back to its offspring's bracket. */}
              {depth > 0 ? (
                <span
                  aria-hidden="true"
                  className="absolute -left-6 top-1/2 h-px w-6 bg-zinc-300 dark:bg-zinc-700"
                />
              ) : null}

              {/* Bracket spanning this node's two parents' centres. */}
              {depth < generations ? (
                <span
                  aria-hidden="true"
                  className="absolute -right-6 top-1/4 h-1/2 w-px bg-zinc-300 dark:bg-zinc-700"
                />
              ) : null}

              {node.id ? (
                <Link
                  href={`/animals/${node.id}`}
                  className={`flex w-full flex-col gap-0.5 rounded-md border border-zinc-200 border-l-4 bg-white px-3 py-2 text-xs shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 ${
                    band ? BAND_BORDER[band] : ""
                  }`}
                >
                  <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                    {node.tagNumber}
                    <span className="ml-1 font-normal text-zinc-400" aria-hidden="true">
                      {node.sex === "FEMALE" ? "♀" : "♂"}
                    </span>
                  </span>
                  {node.name ? (
                    <span className="truncate text-zinc-600 dark:text-zinc-400">{node.name}</span>
                  ) : null}
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {formatDate(node.dateOfBirth)}
                  </span>
                  {band ? (
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      {BAND_LABEL[band]} · {formatPercent(f ?? 0, 1)}
                    </span>
                  ) : null}
                </Link>
              ) : (
                <div className="flex w-full items-center justify-center rounded-md border border-dashed border-zinc-300 px-3 py-3 text-xs text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
                  Unknown
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PedigreeLegend({
  warnThreshold,
  maxThreshold,
}: {
  warnThreshold: number;
  maxThreshold: number;
}) {
  const entries: { band: InbreedingBand; text: string }[] = [
    { band: "NONE", text: "No recorded inbreeding" },
    { band: "LOW", text: `Below ${formatPercent(warnThreshold, 0)}` },
    { band: "MODERATE", text: `${formatPercent(warnThreshold, 0)} to ${formatPercent(maxThreshold, 0)}` },
    { band: "HIGH", text: `Above ${formatPercent(maxThreshold, 0)}` },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-zinc-600 dark:text-zinc-400">
      {entries.map((entry) => (
        <span key={entry.band} className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`h-4 w-1.5 rounded-sm border-l-4 ${BAND_BORDER[entry.band]}`}
          />
          {entry.text}
        </span>
      ))}
      <span className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-4 w-4 rounded-sm border border-dashed border-zinc-400 dark:border-zinc-600"
        />
        Ancestor not recorded
      </span>
    </div>
  );
}
