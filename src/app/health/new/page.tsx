import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { HealthRecordForm, type AnimalChoice } from "@/components/health/health-record-form";
import { createHealthRecord } from "@/app/health/actions";
import { requireRole } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { toDateInputValue } from "@/lib/format";
import { listPigOptions } from "@/lib/db/health";

/**
 * Recording a health event. A WORKER may do this — observation is the whole
 * reason the app is on a phone in the barn — so the guard here is wider than
 * the one on editing an existing record. The Server Action re-checks it.
 */
export default async function NewHealthRecordPage() {
  const user = await requireRole(["ADMIN", "MANAGER", "VETERINARIAN", "WORKER"]);
  const farmId = await getActiveFarmId(user);

  const pigs = await listPigOptions(farmId);
  const animals: AnimalChoice[] = pigs.map((pig) => ({
    id: pig.id,
    tagNumber: pig.tagNumber,
    name: pig.name,
    dateOfBirth: toDateInputValue(pig.dateOfBirth),
    penName: pig.penName,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Record a health event"
        description="Illness, injury, treatment or examination — plus any medication given."
      />

      {animals.length === 0 ? (
        <EmptyState
          title="No active animals to record against"
          description="Add animals to the herd first; a health record has to belong to one."
          action={<ButtonLink href="/animals/new">Add an animal</ButtonLink>}
        />
      ) : (
        <HealthRecordForm
          action={createHealthRecord}
          animals={animals}
          mode="create"
          cancelHref="/health"
        />
      )}
    </div>
  );
}
