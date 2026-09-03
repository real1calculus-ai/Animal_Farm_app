import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { ProtocolFields } from "@/components/health/protocol-fields";
import {
  createProtocolItem,
  deleteProtocolItem,
  toggleProtocolItem,
  updateProtocolItem,
} from "@/app/health/protocols/actions";
import { ADMIN_ROLES, requireRole } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { LIFE_STAGE_LABELS } from "@/lib/labels";
import { listProtocolItems } from "@/lib/db/health";

/**
 * The farm's standing vaccination schedule — the rule that every "due",
 * "overdue" and compliance figure on /health/vaccinations is derived from.
 *
 * ADMIN and MANAGER only, and the guard is `requireRole`, not a hidden nav
 * link: the actions re-check it too, because a Server Action is reachable by
 * direct POST whatever the page rendered.
 */
export default async function ProtocolsPage() {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);

  const items = await listProtocolItems(farmId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vaccination protocol"
        description="The standing schedule: which vaccine, for which stage, at what age or interval."
        actions={
          <ButtonLink href="/health/vaccinations" variant="secondary">
            Back to vaccinations
          </ButtonLink>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="No protocol items yet"
          description="Until the schedule exists nothing can be due or overdue, and the compliance figures have no denominator. Add the items your veterinarian has specified."
        />
      ) : (
        <Card>
          <Table>
            <Thead>
              <Tr>
                <Th>Name</Th>
                <Th>Vaccine</Th>
                <Th>Stage</Th>
                <Th>When due</Th>
                <Th>Notes</Th>
                <Th className="text-right">Doses given</Th>
                <Th className="text-right">Status</Th>
                <Th className="text-right">Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {items.map((item) => (
                <Tr key={item.id} className={item.isActive ? "" : "opacity-60"}>
                  <Td className="font-medium">{item.name}</Td>
                  <Td>{item.vaccineName}</Td>
                  <Td>{LIFE_STAGE_LABELS[item.targetStage]}</Td>
                  <Td>
                    {item.boosterIntervalDays
                      ? `Every ${item.boosterIntervalDays} days`
                      : item.ageDaysMin !== null
                        ? `Age ${item.ageDaysMin}–${item.ageDaysMax ?? item.ageDaysMin} days`
                        : "—"}
                  </Td>
                  <Td className="text-zinc-500 dark:text-zinc-400">{item.notes ?? "—"}</Td>
                  <Td className="text-right tabular-nums">{item.doseCount}</Td>
                  <Td className="text-right">
                    <Badge variant={item.isActive ? "success" : "default"}>
                      {item.isActive ? "Active" : "Retired"}
                    </Badge>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap justify-end gap-2">
                      <form action={toggleProtocolItem}>
                        <input type="hidden" name="id" value={item.id} />
                        <SubmitButton variant="secondary" pendingLabel="Saving...">
                          {item.isActive ? "Retire" : "Reactivate"}
                        </SubmitButton>
                      </form>
                      {item.doseCount === 0 ? (
                        <form action={deleteProtocolItem}>
                          <input type="hidden" name="id" value={item.id} />
                          <SubmitButton variant="danger" pendingLabel="Deleting...">
                            Delete
                          </SubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      )}

      {items.length > 0 ? (
        <Card className="space-y-2">
          <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Edit an item</h2>
          {items.map((item) => (
            <details
              key={item.id}
              className="rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
            >
              <summary className="cursor-pointer text-sm text-zinc-700 dark:text-zinc-300">
                {item.name} — {item.vaccineName}
              </summary>
              <form action={updateProtocolItem} className="mt-3 space-y-4">
                <input type="hidden" name="id" value={item.id} />
                <ProtocolFields
                  idPrefix={`edit-${item.id}`}
                  defaults={{
                    name: item.name,
                    vaccineName: item.vaccineName,
                    targetStage: item.targetStage,
                    ageDaysMin: item.ageDaysMin?.toString() ?? "",
                    ageDaysMax: item.ageDaysMax?.toString() ?? "",
                    boosterIntervalDays: item.boosterIntervalDays?.toString() ?? "",
                    notes: item.notes ?? "",
                    isActive: item.isActive,
                  }}
                />
                <SubmitButton pendingLabel="Saving...">Save changes</SubmitButton>
              </form>
            </details>
          ))}
        </Card>
      ) : null}

      <Card className="space-y-4">
        <div>
          <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Add a protocol item
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Give it either an age window (a primary dose at a certain age) or a booster interval (a
            dose repeated at a fixed interval) — not both.
          </p>
        </div>
        <form action={createProtocolItem} className="space-y-4">
          <ProtocolFields idPrefix="new" />
          <SubmitButton pendingLabel="Adding...">Add protocol item</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
