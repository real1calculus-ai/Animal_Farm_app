import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { FeedSubnav } from "@/components/feed/feed-subnav";
import { FeedTypeForm } from "@/components/feed/feed-type-form";
import { createFeedType, setFeedTypeActive } from "@/app/feed/types/actions";
import { ADMIN_ROLES, requireRole } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { formatCents, formatKg } from "@/lib/format";
import { FEED_CLASSIFICATION_LABELS } from "@/lib/labels";
import { getFeedStockLevels, listFeedTypes, listSuppliers } from "@/lib/db/feed";

/**
 * The feed products the farm buys. Stock is shown alongside each one because
 * the reorder level set here is meaningless without seeing what it is
 * currently being compared against.
 */
export default async function FeedTypesPage() {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);

  const [feedTypes, suppliers, levels] = await Promise.all([
    listFeedTypes(farmId),
    listSuppliers(farmId, { activeOnly: true }),
    getFeedStockLevels(farmId),
  ]);

  const stockById = new Map(levels.map((level) => [level.feedTypeId, level]));

  return (
    <div>
      <PageHeader
        title="Feed types"
        description="The products you buy, their nutritional profile and their reorder levels."
        actions={
          <ButtonLink href="/feed/suppliers" variant="secondary">
            Suppliers
          </ButtonLink>
        }
      />

      <FeedSubnav active="/feed/types" role={user.role} />

      <Card className="mb-6">
        {feedTypes.length === 0 ? (
          <EmptyState
            title="No feed types yet"
            description="Add the first product below. Everything else in this module — deliveries, rations, feed conversion — hangs off a feed type."
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Name</Th>
                <Th>Protein</Th>
                <Th>Energy</Th>
                <Th>Supplier</Th>
                <Th className="text-right">Default price</Th>
                <Th className="text-right">In stock</Th>
                <Th className="text-right">Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {feedTypes.map((feedType) => {
                const stock = stockById.get(feedType.id);
                return (
                  <Tr key={feedType.id} className={feedType.isActive ? "" : "opacity-60"}>
                    <Td>
                      <Link
                        href={`/feed/types/${feedType.id}`}
                        className="font-medium underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-900 dark:decoration-zinc-700 dark:hover:decoration-zinc-100"
                      >
                        {feedType.name}
                      </Link>
                      <span className="mt-0.5 flex flex-wrap gap-1.5">
                        <Badge>{FEED_CLASSIFICATION_LABELS[feedType.classification]}</Badge>
                        {!feedType.isActive ? <Badge variant="warning">Archived</Badge> : null}
                        {stock?.belowReorderLevel ? <Badge variant="danger">Reorder</Badge> : null}
                      </span>
                    </Td>
                    <Td className="tabular-nums">
                      {feedType.proteinPct === null ? "—" : `${feedType.proteinPct}%`}
                    </Td>
                    <Td className="tabular-nums">
                      {feedType.meKcalPerKg === null ? "—" : `${feedType.meKcalPerKg} kcal/kg`}
                    </Td>
                    <Td>{feedType.supplier?.name ?? "—"}</Td>
                    <Td className="text-right tabular-nums">
                      {feedType.costPerKgCents === null
                        ? "—"
                        : `${formatCents(feedType.costPerKgCents)}/kg`}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {formatKg(stock?.usableKg ?? 0)}
                    </Td>
                    <Td className="text-right">
                      <form action={setFeedTypeActive} className="inline-block">
                        <input type="hidden" name="id" value={feedType.id} />
                        <input
                          type="hidden"
                          name="isActive"
                          value={feedType.isActive ? "false" : "true"}
                        />
                        <SubmitButton variant="secondary" pendingLabel="…">
                          {feedType.isActive ? "Archive" : "Restore"}
                        </SubmitButton>
                      </form>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Add a feed type
        </h2>
        <FeedTypeForm action={createFeedType} suppliers={suppliers} submitLabel="Add feed type" />
      </Card>
    </div>
  );
}
