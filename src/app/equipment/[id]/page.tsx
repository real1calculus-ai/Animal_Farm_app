import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { EquipmentForm } from "@/components/equipment/equipment-form";
import { MaintenanceForm } from "@/components/equipment/maintenance-form";
import { recordMaintenance, updateEquipment } from "@/app/equipment/actions";
import { requireRole, ADMIN_ROLES } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import {
  listEquipment,
  listEquipmentCategories,
  listMaintenanceRecords,
} from "@/lib/db/equipment";
import { EQUIPMENT_STATUS_LABELS, MAINTENANCE_TYPE_LABELS } from "@/lib/labels";
import { formatCents, formatDate, formatPercent } from "@/lib/format";

export default async function EquipmentDetailPage({ params }: PageProps<"/equipment/[id]">) {
  const { id } = await params;
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);

  // Read through listEquipment so the derived fields — depreciation, next due
  // date, maintenance state — are computed in exactly one place and cannot
  // drift between this page and the list.
  const [items, records, categories] = await Promise.all([
    listEquipment(farmId),
    listMaintenanceRecords(id, 50),
    listEquipmentCategories(farmId),
  ]);

  const item = items.find((candidate) => candidate.id === id);
  if (!item) notFound();

  const saveEquipment = updateEquipment.bind(null, id);
  const saveMaintenance = recordMaintenance.bind(null, id);
  const { depreciation } = item;

  return (
    <>
      <PageHeader
        title={item.name}
        description={`${item.category}${item.location ? ` · ${item.location}` : ""}${
          item.serialNumber ? ` · S/N ${item.serialNumber}` : ""
        }`}
        actions={
          <Link href="/equipment" className="text-sm underline underline-offset-2">
            All equipment
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <Badge variant={item.status === "NEEDS_REPAIR" ? "danger" : "default"}>
          {EQUIPMENT_STATUS_LABELS[item.status]}
        </Badge>
        {item.maintenanceState === "OVERDUE" ? <Badge variant="danger">Maintenance overdue</Badge> : null}
        {item.maintenanceState === "DUE_SOON" ? <Badge variant="warning">Maintenance due soon</Badge> : null}
        {item.replacementDue ? <Badge variant="warning">Past expected life</Badge> : null}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Purchase cost"
          value={item.purchaseCostCents ? formatCents(item.purchaseCostCents) : "—"}
          hint={item.purchaseDate ? formatDate(item.purchaseDate) : "No purchase date recorded"}
        />
        <StatTile
          label="Book value"
          value={depreciation.computable ? formatCents(depreciation.bookValueCents) : "—"}
          hint={
            depreciation.computable
              ? `${formatCents(depreciation.accumulatedCents)} depreciated · ${formatPercent(
                  depreciation.lifeUsedFraction,
                  0
                )} of life used`
              : "Needs a purchase date, cost and expected life"
          }
        />
        <StatTile
          label="Maintenance spend"
          value={formatCents(item.maintenanceCostCents)}
          hint={item.nextDueAt ? `Next due ${formatDate(item.nextDueAt)}` : "Nothing scheduled"}
        />
      </div>

      {item.notes ? (
        <Card className="mb-6">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">{item.notes}</p>
        </Card>
      ) : null}

      <h2 className="mb-3 text-lg font-medium">Record maintenance</h2>
      <Card className="mb-6">
        <MaintenanceForm action={saveMaintenance} />
      </Card>

      <h2 className="mb-3 text-lg font-medium">Maintenance history</h2>
      {records.length === 0 ? (
        <div className="mb-6">
          <EmptyState title="No maintenance recorded yet" />
        </div>
      ) : (
        <Card className="mb-6 p-0">
          <Table>
            <Thead>
              <Tr>
                <Th>Date</Th>
                <Th>Type</Th>
                <Th>What was done</Th>
                <Th className="text-right">Cost</Th>
                <Th>Next due</Th>
                <Th>By</Th>
              </Tr>
            </Thead>
            <Tbody>
              {records.map((record) => (
                <Tr key={record.id}>
                  <Td>{formatDate(record.performedAt)}</Td>
                  <Td>
                    <Badge>{MAINTENANCE_TYPE_LABELS[record.maintenanceType]}</Badge>
                  </Td>
                  <Td>{record.description}</Td>
                  <Td className="text-right tabular-nums">{formatCents(record.costCents)}</Td>
                  <Td>{record.nextDueAt ? formatDate(record.nextDueAt) : "—"}</Td>
                  <Td>{record.createdBy?.name ?? "—"}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      )}

      <Card>
        <details>
          <summary className="cursor-pointer font-medium text-zinc-900 dark:text-zinc-100">
            Edit this item
          </summary>
          <div className="mt-4">
            <EquipmentForm
              action={saveEquipment}
              categories={categories}
              submitLabel="Save changes"
              idPrefix="edit-equipment"
              values={{
                name: item.name,
                category: item.category,
                serialNumber: item.serialNumber,
                location: item.location,
                purchaseDate: item.purchaseDate,
                purchaseCostCents: item.purchaseCostCents,
                expectedLifeMonths: item.expectedLifeMonths,
                status: item.status,
                notes: item.notes,
              }}
            />
          </div>
        </details>
      </Card>
    </>
  );
}
