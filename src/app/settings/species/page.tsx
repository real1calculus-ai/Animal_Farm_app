import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { SpeciesForm, type SpeciesRow } from "@/components/settings/species-form";
import { saveActiveSpecies } from "@/app/settings/species/actions";
import { ADMIN_ROLES, requireRole } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { listSpeciesWithUsage } from "@/lib/db/species";

/**
 * What the farm keeps.
 *
 * Signup installs the whole catalogue so the app is usable on the first screen,
 * which leaves a goat keeper with catfish and snails in every dropdown until
 * they come here. Switching a species off hides it from the forms and filters
 * without touching a single record — see setActiveSpecies().
 */
export default async function SpeciesSettingsPage() {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);

  const species = await listSpeciesWithUsage(farmId);

  const rows: SpeciesRow[] = species.map((entry) => ({
    id: entry.id,
    name: entry.name,
    isActive: entry.isActive,
    trackingMode: entry.trackingMode,
    purpose: entry.purpose,
    gestationDays: entry.gestationDays,
    recordCount: entry.animalCount + entry.batchCount,
  }));

  const activeCount = rows.filter((row) => row.isActive).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Species"
        description={`What this farm keeps. ${activeCount} of ${rows.length} switched on — only those appear in the forms, filters and dropdowns everywhere else.`}
      />

      <Card>
        <SpeciesForm species={rows} action={saveActiveSpecies} />
      </Card>

      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Each species carries its own biology — gestation, breeding age, body condition scale and
        the words used for its young and its adults. The farm-wide fallbacks on{" "}
        <Link href="/settings" className="underline underline-offset-2">
          farm settings
        </Link>{" "}
        apply only where a species leaves a value unset.
      </p>
    </div>
  );
}
