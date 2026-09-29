import { requireRole, OBSERVE_ROLES } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { PageHeader } from "@/components/ui/page-header";
import { OfflineProvider } from "@/lib/offline/provider";
import { HealthOfflineClient } from "@/app/health/offline/health-offline-client";

/**
 * The offline-capable counterpart to /health/new — works with no
 * connection at all. Separate route rather than replacing /health/new
 * outright: this is the first PowerSync-backed screen in the app and
 * hasn't been exercised against a live PowerSync instance yet (see
 * docs/offline-first.md), so the existing server-rendered flow stays the
 * default until it has been.
 */
export default async function HealthOfflinePage() {
  const user = await requireRole(OBSERVE_ROLES);
  const farmId = await getActiveFarmId(user);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Record a health event (offline-capable)"
        description="Works with no signal. Saved to this device immediately and synced automatically once connected."
      />
      <OfflineProvider>
        <HealthOfflineClient farmId={farmId} />
      </OfflineProvider>
    </div>
  );
}
