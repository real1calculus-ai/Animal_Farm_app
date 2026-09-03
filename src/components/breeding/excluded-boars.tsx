import { Badge } from "@/components/ui/badge";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { inbreedingBandVariant } from "@/lib/breeding/inbreeding";
import type { SireMatch } from "@/lib/breeding/match-finder";
import { BAND_LABELS } from "@/components/breeding/match-card";

/**
 * The boars the engine refused, with the reason for each.
 *
 * Collapsed by default but never hidden: a user who cannot see *why* the
 * obvious boar is missing from the recommendations concludes the system is
 * broken and goes back to breeding from memory, which is the exact failure this
 * module exists to prevent. Built on `<details>` so it works before hydration.
 */
export function ExcludedBoars({ excluded }: { excluded: SireMatch[] }) {
  if (excluded.length === 0) return null;

  return (
    <details className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-zinc-800 marker:content-none dark:text-zinc-200">
        <span className="mr-2 text-zinc-400" aria-hidden="true">▸</span>
        Excluded boars ({excluded.length}) — why they are not listed above
      </summary>

      <div className="border-t border-zinc-200 px-1 pb-2 dark:border-zinc-800">
        <Table>
          <Thead>
            <Tr>
              <Th>Boar</Th>
              <Th>Relationship</Th>
              <Th className="text-right">Offspring F</Th>
              <Th>Why excluded</Th>
            </Tr>
          </Thead>
          <Tbody>
            {excluded.map((boar) => (
              <Tr key={boar.sireId}>
                <Td className="whitespace-nowrap font-medium">
                  {boar.tagNumber}
                  {boar.name ? (
                    <span className="block text-xs font-normal text-zinc-500">{boar.name}</span>
                  ) : null}
                </Td>
                <Td className="text-zinc-600 dark:text-zinc-400">{boar.relationshipLabel}</Td>
                <Td className="whitespace-nowrap text-right">
                  <Badge variant={inbreedingBandVariant(boar.band)}>
                    {(boar.inbreedingCoefficient * 100).toFixed(1)}%
                  </Badge>
                  <span className="sr-only">{BAND_LABELS[boar.band]}</span>
                </Td>
                <Td>
                  <ul className="list-disc space-y-0.5 pl-4 text-red-700 dark:text-red-400">
                    {boar.blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </div>
    </details>
  );
}
