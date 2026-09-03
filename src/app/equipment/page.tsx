import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { EquipmentForm } from "@/components/equipment/equipment-form";
import { createEquipment } from "@/app/equipment/actions";
import { requireRole, ADMIN_ROLES } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { listEquipment, getEquipmentSummary, listEquipmentCategories } from "@/lib/db/equipment";
import { EQUIPMENT_STATUS_LABELS } from "@/lib/labels";
import { formatCents, formatDate } from "@/lib/format";

const MAINTENANCE_BADGE = {
  OVERDUE: { variant: "danger", label: "Maintenance overdue" },
  DUE_SOON: { variant: "warning", label: "Due soon" },
  SCHEDULED: { variant: "default", label: "Scheduled" },
  NONE: null,
} as const;

export default async function EquipmentPage() {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);

  const [items, summary, categories] = await Promise.all([
    listEquipment(farmId),
    getEquipmentSummary(farmId),
    listEquipmentCategories(farmId),
  ]);

  return (
    <>
      <PageHeader
        title="Equipment"
        description="Assets, their maintenance schedule and current book value."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Items"
          value={String(summary.itemCount)}
          hint={`${summary.inService} in service · ${summary.needsRepair} needing repair`}
        />
        <StatTile
          label="Book value"
          value={formatCents(summary.bookValueCents)}
          hint={`${formatCents(summary.accumulatedDepreciationCents)} depreciated`}
        />
        <StatTile
          label="Maintenance due"
          value={String(summary.maintenanceOverdue + summary.maintenanceDueSoon)}
          hint={`${summary.maintenanceOverdue} overdue`}
        />
        <StatTile
          label="Past expected life"
          value={String(summary.replacementDue)}
          hint="Worth planning a replacement"
        />
      </div>

      {items.length === 0 ? (
        <div className="mb-6">
          <EmptyState
            title="No equipment recorded"
            description="Track feeders, waterers, veterinary and breeding equipment here to get maintenance reminders and a running book value."
          />
        </div>
      ) : (
        <Card className="mb-6 p-0">
          <Table>
            <Thead>
              <Tr>
                <Th>Item</Th>
                <Th>Category</Th>
                <Th>Status</Th>
                <Th>Last serviced</Th>
                <Th>Next due</Th>
                <Th className="text-right">Book value</Th>
              </Tr>
            </Thead>
            <Tbody>
              {items.map((item) => {
                const badge = MAINTENANCE_BADGE[item.maintenanceState];
                return (
                  <Tr key={item.id}>
                    <Td>
                      <Link href={`/equipment/${item.id}`} className="font-medium underline underline-offset-2">
                        {item.name}
                      </Link>
                      {item.location ? (
                        <span className="block text-xs text-zinc-500 dark:text-zinc-400">{item.location}</span>
                      ) : null}
                    </Td>
                    <Td>{item.category}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={item.status === "NEEDS_REPAIR" ? "danger" : "default"}>
                          {EQUIPMENT_STATUS_LABELS[item.status]}
                        </Badge>
                        {badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : null}
                        {item.replacementDue ? <Badge variant="warning">Past life</Badge> : null}
                      </div>
                    </Td>
                    <Td>{item.lastMaintenanceAt ? formatDate(item.lastMaintenanceAt) : "—"}</Td>
                    <Td>{item.nextDueAt ? formatDate(item.nextDueAt) : "—"}</Td>
                    <Td className="text-right tabular-nums">
                      {item.depreciation.computable ? formatCents(item.depreciation.bookValueCents) : "—"}
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </Card>
      )}

      <Card>
        <details>
          <summary className="cursor-pointer font-medium text-zinc-900 dark:text-zinc-100">
            Add equipment
          </summary>
          <div className="mt-4">
            <EquipmentForm
              action={createEquipment}
              categories={categories}
              submitLabel="Add equipment"
              idPrefix="new-equipment"
            />
          </div>
        </details>
      </Card>
    </>
  );
}
