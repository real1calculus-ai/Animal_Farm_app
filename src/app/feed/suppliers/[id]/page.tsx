import { notFound } from "next/navigation";

import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedSubnav } from "@/components/feed/feed-subnav";
import { SupplierForm } from "@/components/feed/supplier-form";
import { deleteSupplier, updateSupplier } from "@/app/feed/suppliers/actions";
import { ADMIN_ROLES, requireRole } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { formatCents, formatDate, formatKg } from "@/lib/format";
import { getSupplier, listBatches } from "@/lib/db/feed";
import Link from "next/link";

export default async function SupplierDetailPage({ params }: PageProps<"/feed/suppliers/[id]">) {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);
  const { id } = await params;

  const supplier = await getSupplier(farmId, id);
  if (!supplier) notFound();

  const batches = await listBatches(farmId, { supplierId: supplier.id, view: "all" });

  return (
    <div>
      <PageHeader title={supplier.name} description={supplier.contact ?? undefined} />

      <FeedSubnav active="/feed/suppliers" role={user.role} />

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Deliveries from this supplier
        </h2>
        {batches.length === 0 ? (
          <EmptyState
            title="No deliveries recorded"
            description="Batches recorded against this supplier will appear here, with their lot numbers."
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Batch</Th>
                <Th>Lot number</Th>
                <Th>Feed</Th>
                <Th>Received</Th>
                <Th className="text-right">Quantity</Th>
                <Th className="text-right">Cost</Th>
              </Tr>
            </Thead>
            <Tbody>
              {batches.map((batch) => (
                <Tr key={batch.id}>
                  <Td>
                    <Link
                      href={`/feed/batches/${batch.id}`}
                      className="font-medium underline decoration-zinc-300 underline-offset-2 dark:decoration-zinc-700"
                    >
                      {batch.batchCode}
                    </Link>
                  </Td>
                  <Td>{batch.supplierLotNumber ?? "—"}</Td>
                  <Td>{batch.feedType.name}</Td>
                  <Td>{formatDate(batch.receivedDate)}</Td>
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

      <Card className="mb-6">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Edit supplier
        </h2>
        <SupplierForm
          action={updateSupplier}
          id={supplier.id}
          defaults={supplier}
          submitLabel="Save changes"
        />
      </Card>

      <Card className="border-red-200 dark:border-red-900">
        <h2 className="mb-2 text-sm font-semibold text-red-800 dark:text-red-300">Delete</h2>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          Only possible while no feed type or delivery references this supplier — deleting one that
          does would break the link a recall notice is matched against.
        </p>
        <form action={deleteSupplier}>
          <input type="hidden" name="id" value={supplier.id} />
          <SubmitButton variant="danger" pendingLabel="Deleting…">
            Delete supplier
          </SubmitButton>
        </form>
      </Card>
    </div>
  );
}
