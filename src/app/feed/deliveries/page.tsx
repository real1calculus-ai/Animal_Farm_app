import Link from "next/link";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { FeedSubnav } from "@/components/feed/feed-subnav";
import { DeliveryForm } from "@/components/feed/delivery-form";
import { recordDelivery } from "@/app/feed/deliveries/actions";
import { ADMIN_ROLES, requireRole } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { formatCents, formatDate, formatKg } from "@/lib/format";
import { listBatches, listFeedTypes, listStorageLocations, listSuppliers } from "@/lib/db/feed";

/**
 * Recording a delivery.
 *
 * The save writes the batch AND its ledger entry in one transaction — feed is
 * the biggest recurring cost on the farm, and the finance module reads the
 * ledger rather than re-deriving spend from stock, so the two have to be
 * written together or not at all.
 */
export default async function FeedDeliveriesPage() {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);

  const [feedTypes, suppliers, storageLocations, recent] = await Promise.all([
    listFeedTypes(farmId, { activeOnly: true }),
    listSuppliers(farmId, { activeOnly: true }),
    listStorageLocations(farmId),
    listBatches(farmId, { view: "all" }),
  ]);

  const recentTen = recent.slice(0, 10);

  return (
    <div>
      <PageHeader
        title="Record a feed delivery"
        description="Creates the batch, sets its remaining quantity, and posts the cost to the ledger in one save."
        actions={
          <ButtonLink href="/feed/batches" variant="secondary">
            All batches
          </ButtonLink>
        }
      />

      <FeedSubnav active="/feed/deliveries" role={user.role} />

      <Card className="mb-6">
        {feedTypes.length === 0 ? (
          <EmptyState
            title="Add a feed type first"
            description="A delivery is recorded against a feed product — its price, profile and reorder level live there."
            action={<ButtonLink href="/feed/types">Add a feed type</ButtonLink>}
          />
        ) : (
          <DeliveryForm
            action={recordDelivery}
            feedTypes={feedTypes.map((feedType) => ({
              id: feedType.id,
              name: feedType.name,
              costPerKgCents: feedType.costPerKgCents,
              supplierId: feedType.supplierId,
            }))}
            suppliers={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }))}
            storageLocations={storageLocations
              .filter((location) => location.isActive)
              .map((location) => ({ id: location.id, name: location.name }))}
          />
        )}
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Recent deliveries
        </h2>
        {recentTen.length === 0 ? (
          <EmptyState title="No deliveries recorded yet" />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Received</Th>
                <Th>Batch</Th>
                <Th>Feed</Th>
                <Th>Supplier</Th>
                <Th className="text-right">Quantity</Th>
                <Th className="text-right">Cost</Th>
              </Tr>
            </Thead>
            <Tbody>
              {recentTen.map((batch) => (
                <Tr key={batch.id}>
                  <Td>{formatDate(batch.receivedDate)}</Td>
                  <Td>
                    <Link
                      href={`/feed/batches/${batch.id}`}
                      className="font-medium underline decoration-zinc-300 underline-offset-2 dark:decoration-zinc-700"
                    >
                      {batch.batchCode}
                    </Link>
                  </Td>
                  <Td>{batch.feedType.name}</Td>
                  <Td>{batch.supplier?.name ?? "—"}</Td>
                  <Td className="text-right tabular-nums">{formatKg(batch.quantityKg, 0)}</Td>
                  <Td className="text-right tabular-nums">
                    {formatCents(Math.round(batch.quantityKg * batch.costPerKgCents))}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
