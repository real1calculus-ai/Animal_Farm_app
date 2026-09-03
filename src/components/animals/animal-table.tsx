import Link from "next/link";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { AnimalStatusBadge } from "@/components/animals/status-badge";
import { formatAge, formatKg } from "@/lib/format";
import { LIFE_STAGE_LABELS, SEX_LABELS } from "@/lib/labels";
import type { AnimalListRow } from "@/lib/db/animals";

/**
 * The herd table. Scrolls inside its own container with a sticky header, so on
 * a phone the column meanings stay on screen while thumbing through a few
 * hundred animals and the page itself never scrolls sideways.
 */
export function AnimalTable({ animals }: { animals: AnimalListRow[] }) {
  return (
    <div className="max-h-[65vh] overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <Table>
        <Thead className="sticky top-0 z-10 bg-white dark:bg-zinc-950">
          <Tr>
            <Th>Tag</Th>
            <Th>Name</Th>
            <Th>Breed</Th>
            <Th>Sex</Th>
            <Th>Age</Th>
            <Th>Stage</Th>
            <Th className="text-right">Weight</Th>
            <Th>Pen</Th>
            <Th>Status</Th>
          </Tr>
        </Thead>
        <Tbody>
          {animals.map((animal) => (
            <Tr key={animal.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900">
              <Td className="whitespace-nowrap font-medium">
                <Link
                  href={`/animals/${animal.id}`}
                  className="text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100"
                >
                  {animal.tagNumber}
                </Link>
              </Td>
              <Td className="whitespace-nowrap">{animal.name ?? "—"}</Td>
              <Td className="whitespace-nowrap">{animal.breed}</Td>
              <Td className="whitespace-nowrap">{SEX_LABELS[animal.sex]}</Td>
              <Td className="whitespace-nowrap">{formatAge(animal.dateOfBirth)}</Td>
              <Td className="whitespace-nowrap">{LIFE_STAGE_LABELS[animal.lifeStage]}</Td>
              <Td className="whitespace-nowrap text-right tabular-nums">
                {formatKg(animal.currentWeightKg)}
              </Td>
              <Td className="whitespace-nowrap">
                {animal.pen ? (
                  <Link
                    href={`/pens/${animal.pen.id}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {animal.pen.name}
                  </Link>
                ) : (
                  "—"
                )}
              </Td>
              <Td className="whitespace-nowrap">
                <AnimalStatusBadge status={animal.status} />
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </div>
  );
}
