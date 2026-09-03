import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { FeedSubnav } from "@/components/feed/feed-subnav";
import { SupplierForm } from "@/components/feed/supplier-form";
import { createSupplier, setSupplierActive } from "@/app/feed/suppliers/actions";
import { ADMIN_ROLES, requireRole } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { listSuppliers } from "@/lib/db/feed";

/**
 * Suppliers. They live in the feed module because feed is where they are
 * actually used — a delivery names one, and a contamination notice arrives
 * from one, which is the moment the phone number on this screen matters.
 */
export default async function SuppliersPage() {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);
  const suppliers = await listSuppliers(farmId);

  return (
    <div>
      <PageHeader
        title="Suppliers"
        description="Who you buy feed from, and how to reach them when a lot has to be traced."
      />

      <FeedSubnav active="/feed/suppliers" role={user.role} />

      <Card className="mb-6">
        {suppliers.length === 0 ? (
          <EmptyState
            title="No suppliers yet"
            description="Add the merchants and mills you buy from. Deliveries record which supplier and which lot number they came from."
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Name</Th>
                <Th>Contact</Th>
                <Th>Phone</Th>
                <Th className="text-right">Feeds</Th>
                <Th className="text-right">Deliveries</Th>
                <Th className="text-right">Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {suppliers.map((supplier) => (
                <Tr key={supplier.id} className={supplier.isActive ? "" : "opacity-60"}>
                  <Td>
                    <Link
                      href={`/feed/suppliers/${supplier.id}`}
                      className="font-medium underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-900 dark:decoration-zinc-700 dark:hover:decoration-zinc-100"
                    >
                      {supplier.name}
                    </Link>
                    {!supplier.isActive ? (
                      <Badge variant="warning" className="ml-2">
                        Inactive
                      </Badge>
                    ) : null}
                  </Td>
                  <Td>{supplier.contact ?? "—"}</Td>
                  <Td>
                    {supplier.phone ? (
                      <a
                        href={`tel:${supplier.phone}`}
                        className="underline decoration-zinc-300 underline-offset-2 dark:decoration-zinc-700"
                      >
                        {supplier.phone}
                      </a>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">{supplier._count.feedTypes}</Td>
                  <Td className="text-right tabular-nums">{supplier._count.feedBatches}</Td>
                  <Td className="text-right">
                    <form action={setSupplierActive} className="inline-block">
                      <input type="hidden" name="id" value={supplier.id} />
                      <input
                        type="hidden"
                        name="isActive"
                        value={supplier.isActive ? "false" : "true"}
                      />
                      <SubmitButton variant="secondary" pendingLabel="…">
                        {supplier.isActive ? "Deactivate" : "Reactivate"}
                      </SubmitButton>
                    </form>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Add a supplier
        </h2>
        <SupplierForm action={createSupplier} submitLabel="Add supplier" />
      </Card>
    </div>
  );
}
