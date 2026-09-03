import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { FeedSubnav } from "@/components/feed/feed-subnav";
import { batchViewParam, firstParam } from "@/components/feed/search-params";
import { ADMIN_ROLES, requireUser } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { formatCents, formatDate, formatKg } from "@/lib/format";
import { EXPIRY_WARNING_DAYS, listBatches, listFeedTypes, listSuppliers } from "@/lib/db/feed";
import { expiresWithin, isExpired } from "@/lib/feed/allocation";

/**
 * Every delivery ever received, filterable.
 *
 * The default view is in-stock rather than everything: emptied batches are
 * history worth keeping (they are the recall trail) but they are not what
 * anyone opens this screen to see.
 */
export default async function FeedBatchesPage({ searchParams }: PageProps<"/feed/batches">) {
  const user = await requireUser();
  const farmId = await getActiveFarmId(user);
  const params = await searchParams;

  const view = batchViewParam(params.view);
  const feedTypeId = firstParam(params.feedTypeId);
  const supplierId = firstParam(params.supplierId);

  const [batches, feedTypes, suppliers] = await Promise.all([
    listBatches(farmId, {
      view,
      feedTypeId: feedTypeId ?? undefined,
      supplierId: supplierId ?? undefined,
    }),
    listFeedTypes(farmId),
    listSuppliers(farmId),
  ]);

  const now = new Date();

  return (
    <div>
      <PageHeader
        title="Feed batches"
        description="Each delivery as its own lot, so which animals ate which batch stays answerable."
        actions={
          ADMIN_ROLES.includes(user.role) ? (
            <ButtonLink href="/feed/deliveries">Record delivery</ButtonLink>
          ) : undefined
        }
      />

      <FeedSubnav active="/feed/batches" role={user.role} />

      <Card className="mb-6">
        <form className="grid gap-4 sm:grid-cols-4" method="get">
          <Field label="Show" htmlFor="view">
            <Select id="view" name="view" defaultValue={view}>
              <option value="in-stock">In stock</option>
              <option value="expiring">Expiring within {EXPIRY_WARNING_DAYS} days</option>
              <option value="expired">Expired, still held</option>
              <option value="all">All batches</option>
            </Select>
          </Field>

          <Field label="Feed type" htmlFor="feedTypeId">
            <Select id="feedTypeId" name="feedTypeId" defaultValue={feedTypeId ?? ""}>
              <option value="">All feeds</option>
              {feedTypes.map((feedType) => (
                <option key={feedType.id} value={feedType.id}>
                  {feedType.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Supplier" htmlFor="supplierId">
            <Select id="supplierId" name="supplierId" defaultValue={supplierId ?? ""}>
              <option value="">All suppliers</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex items-end">
            <SubmitButton variant="secondary" pendingLabel="Filtering…">
              Apply
            </SubmitButton>
          </div>
        </form>
      </Card>

      <Card>
        {batches.length === 0 ? (
          <EmptyState
            title="No batches match"
            description="Try a wider filter, or record the first delivery."
            action={
              ADMIN_ROLES.includes(user.role) ? (
                <ButtonLink href="/feed/deliveries">Record delivery</ButtonLink>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Batch</Th>
                <Th>Feed</Th>
                <Th>Supplier</Th>
                <Th>Received</Th>
                <Th>Expires</Th>
                <Th className="text-right">Remaining</Th>
                <Th className="text-right">Value</Th>
                <Th className="text-right">Fed</Th>
              </Tr>
            </Thead>
            <Tbody>
              {batches.map((batch) => {
                const expired = isExpired(batch, now);
                const expiring = expiresWithin(batch, EXPIRY_WARNING_DAYS, now);
                return (
                  <Tr key={batch.id} className={batch.remainingKg <= 0 ? "opacity-60" : ""}>
                    <Td>
                      <Link
                        href={`/feed/batches/${batch.id}`}
                        className="font-medium underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-900 dark:decoration-zinc-700 dark:hover:decoration-zinc-100"
                      >
                        {batch.batchCode}
                      </Link>
                      {batch.supplierLotNumber ? (
                        <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                          Lot {batch.supplierLotNumber}
                        </span>
                      ) : null}
                    </Td>
                    <Td>{batch.feedType.name}</Td>
                    <Td>{batch.supplier?.name ?? "—"}</Td>
                    <Td>{formatDate(batch.receivedDate)}</Td>
                    <Td>
                      {formatDate(batch.expirationDate)}
                      {expired && batch.remainingKg > 0 ? (
                        <Badge variant="danger" className="ml-2">
                          Expired
                        </Badge>
                      ) : expiring && batch.remainingKg > 0 ? (
                        <Badge variant="warning" className="ml-2">
                          Soon
                        </Badge>
                      ) : null}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {formatKg(batch.remainingKg)}
                      <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                        of {formatKg(batch.quantityKg, 0)}
                      </span>
                    </Td>
                    <Td className="text-right tabular-nums">
                      {formatCents(Math.round(batch.remainingKg * batch.costPerKgCents))}
                    </Td>
                    <Td className="text-right tabular-nums">{batch._count.feedingRecords}</Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
