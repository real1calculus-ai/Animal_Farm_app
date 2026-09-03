import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { SubmitButton } from "@/components/ui/submit-button";
import { FeedSubnav } from "@/components/feed/feed-subnav";
import { StockBar } from "@/components/feed/stock-bar";
import { StorageForm } from "@/components/feed/storage-form";
import {
  createStorageLocation,
  deleteStorageLocation,
  updateStorageLocation,
} from "@/app/feed/storage/actions";
import { ADMIN_ROLES, requireRole } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { formatKg, formatPercent } from "@/lib/format";
import { listStorageLocations } from "@/lib/db/feed";

/**
 * Where feed physically sits, and how full each place is.
 *
 * Fill level is computed from the batches assigned to a location rather than
 * entered, so it cannot drift from the stock figures on the inventory screen.
 * A location over capacity is called out: feed stacked past what a bin holds
 * is a spoilage problem before it is an arithmetic one.
 */
export default async function FeedStoragePage() {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);
  const locations = await listStorageLocations(farmId);

  const totalStored = locations.reduce((sum, location) => sum + location.storedKg, 0);
  const totalCapacity = locations.reduce((sum, location) => sum + (location.capacityKg ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Feed storage"
        description="Bins, silos and store rooms, with how much feed each is holding."
      />

      <FeedSubnav active="/feed/storage" role={user.role} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Locations" value={String(locations.filter((l) => l.isActive).length)} />
        <StatTile label="Feed stored" value={formatKg(totalStored, 0)} />
        <StatTile
          label="Overall fill"
          value={totalCapacity > 0 ? formatPercent(totalStored / totalCapacity, 0) : "—"}
          hint={totalCapacity > 0 ? `of ${formatKg(totalCapacity, 0)} capacity` : "No capacities set"}
        />
      </div>

      <Card className="mb-6">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Locations</h2>

        {locations.length === 0 ? (
          <EmptyState
            title="No storage locations yet"
            description="Add the places feed is kept. A delivery can then be assigned to one, and this screen shows how full each is."
          />
        ) : (
          <ul className="space-y-6">
            {locations.map((location) => (
              <li
                key={location.id}
                className="border-b border-zinc-100 pb-6 last:border-0 last:pb-0 dark:border-zinc-800"
              >
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {location.name}
                    {!location.isActive ? (
                      <Badge variant="warning" className="ml-2">
                        Out of use
                      </Badge>
                    ) : null}
                    {location.overCapacity ? (
                      <Badge variant="danger" className="ml-2">
                        Over capacity
                      </Badge>
                    ) : null}
                  </span>
                  <span className="text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
                    {formatKg(location.storedKg, 0)}
                    {location.capacityKg ? ` of ${formatKg(location.capacityKg, 0)}` : ""}
                    {location.fillFraction !== null
                      ? ` · ${formatPercent(location.fillFraction, 0)}`
                      : ""}
                    {" · "}
                    {location.batchCount} {location.batchCount === 1 ? "batch" : "batches"}
                  </span>
                </div>

                <StockBar usableKg={location.storedKg} capacityKg={location.capacityKg} />

                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
                    Edit
                  </summary>
                  <div className="mt-3 space-y-4">
                    <StorageForm
                      action={updateStorageLocation}
                      id={location.id}
                      defaults={location}
                      submitLabel="Save changes"
                    />
                    <form action={deleteStorageLocation}>
                      <input type="hidden" name="id" value={location.id} />
                      <SubmitButton variant="danger" pendingLabel="Deleting…">
                        Delete location
                      </SubmitButton>
                    </form>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Add a location
        </h2>
        <StorageForm action={createStorageLocation} />
      </Card>
    </div>
  );
}
