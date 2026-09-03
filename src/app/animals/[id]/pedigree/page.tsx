import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { DepthPicker } from "@/components/pedigree/depth-picker";
import { PedigreeLegend, PedigreeTree } from "@/components/pedigree/pedigree-tree";
import { InbreedingSummary } from "@/components/animals/inbreeding-summary";
import { requireUser } from "@/lib/auth";
import { getActiveFarmId, getFarmSettings } from "@/lib/active-farm";
import { getAnimal } from "@/lib/db/animals";
import { buildPedigreeTree, loadPedigreeIndex } from "@/lib/breeding/pedigree";
import { createInbreedingCalculator, pedigreeCompleteness } from "@/lib/breeding/inbreeding";
import type { PedigreeTreeNode } from "@/lib/breeding/pedigree";

const ALLOWED_DEPTHS = [3, 4, 5];
const DEFAULT_DEPTH = 4;

/** Collects every node in the tree, so F is computed once per ancestor. */
function walk(node: PedigreeTreeNode | null, out: PedigreeTreeNode[]): void {
  if (!node) return;
  out.push(node);
  walk(node.mother, out);
  walk(node.father, out);
}

export default async function PedigreePage({
  params,
  searchParams,
}: PageProps<"/animals/[id]/pedigree">) {
  const user = await requireUser();
  const farmId = await getActiveFarmId(user);

  const { id } = await params;
  const query = await searchParams;

  const rawDepth = Array.isArray(query.depth) ? query.depth[0] : query.depth;
  const parsedDepth = Number.parseInt(rawDepth ?? "", 10);
  const generations = ALLOWED_DEPTHS.includes(parsedDepth) ? parsedDepth : DEFAULT_DEPTH;

  const animal = await getAnimal(farmId, id);
  if (!animal) notFound();

  const [index, settings] = await Promise.all([
    loadPedigreeIndex(farmId),
    getFarmSettings(farmId),
  ]);

  const tree = buildPedigreeTree(index, id, generations);
  if (!tree) notFound();

  const nodes: PedigreeTreeNode[] = [];
  walk(tree, nodes);

  const calculator = createInbreedingCalculator(index);
  const coefficients: Record<string, number> = {};
  for (const node of nodes) {
    if (node.id && coefficients[node.id] === undefined) {
      coefficients[node.id] = calculator.inbreedingOf(node.id);
    }
  }

  const ancestorSlots = 2 ** (generations + 1) - 2;
  const knownAncestors = nodes.filter((node) => node.depth > 0 && node.id !== null).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Pedigree — ${animal.tagNumber}${animal.name ? ` (${animal.name})` : ""}`}
        description={`${knownAncestors} of ${ancestorSlots} ancestor slots recorded over ${generations} generations.`}
        actions={
          <>
            <DepthPicker animalId={animal.id} depth={generations} />
            <ButtonLink href={`/animals/${animal.id}`} variant="secondary">
              Back to animal
            </ButtonLink>
          </>
        }
      />

      <InbreedingSummary
        coefficient={calculator.inbreedingOf(id)}
        completeness={pedigreeCompleteness(index, id, generations)}
        generations={generations}
        warnThreshold={settings.warnInbreedingCoefficient}
        maxThreshold={settings.maxInbreedingCoefficient}
      />

      <Card className="flex flex-col gap-4">
        <PedigreeLegend
          warnThreshold={settings.warnInbreedingCoefficient}
          maxThreshold={settings.maxInbreedingCoefficient}
        />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Each node is coloured by that animal&apos;s own inbreeding coefficient, not this one&apos;s.
          Dashed boxes are ancestors nobody has recorded — the shape of the gaps is the finding.
          Scroll sideways for the older generations.
        </p>
        <PedigreeTree
          root={tree}
          generations={generations}
          coefficients={coefficients}
          warnThreshold={settings.warnInbreedingCoefficient}
          maxThreshold={settings.maxInbreedingCoefficient}
        />
      </Card>
    </div>
  );
}
