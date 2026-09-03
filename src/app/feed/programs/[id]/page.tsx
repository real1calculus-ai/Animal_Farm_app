import { notFound } from "next/navigation";

import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { FeedSubnav } from "@/components/feed/feed-subnav";
import { ProgramForm } from "@/components/feed/program-form";
import { deleteFeedingProgram, updateFeedingProgram } from "@/app/feed/programs/actions";
import { ADMIN_ROLES, requireRole } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { LIFE_STAGE_LABELS } from "@/lib/labels";
import { getFeedingProgram, listFeedTypes } from "@/lib/db/feed";

export default async function FeedingProgramDetailPage({
  params,
}: PageProps<"/feed/programs/[id]">) {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);
  const { id } = await params;

  const [program, feedTypes] = await Promise.all([
    getFeedingProgram(farmId, id),
    listFeedTypes(farmId, { activeOnly: true }),
  ]);

  if (!program) notFound();

  return (
    <div>
      <PageHeader
        title={program.name}
        description={`${LIFE_STAGE_LABELS[program.stage]} · ${program.feedType.name}`}
      />

      <FeedSubnav active="/feed/programs" role={user.role} />

      <Card className="mb-6">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Edit programme
        </h2>
        <ProgramForm
          action={updateFeedingProgram}
          id={program.id}
          feedTypes={feedTypes}
          defaults={program}
          submitLabel="Save changes"
        />
      </Card>

      <Card className="border-red-200 dark:border-red-900">
        <h2 className="mb-2 text-sm font-semibold text-red-800 dark:text-red-300">Delete</h2>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          A programme is a standing instruction, not history — feeding records already written keep
          their own figures, so deleting this only stops it being suggested in future.
        </p>
        <form action={deleteFeedingProgram}>
          <input type="hidden" name="id" value={program.id} />
          <SubmitButton variant="danger" pendingLabel="Deleting…">
            Delete programme
          </SubmitButton>
        </form>
      </Card>
    </div>
  );
}
