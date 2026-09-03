import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { SubmitButton } from "@/components/ui/submit-button";
import { FeedSubnav } from "@/components/feed/feed-subnav";
import { FeedTypeForm } from "@/components/feed/feed-type-form";
import { deleteFeedType, updateFeedType } from "@/app/feed/types/actions";
import { ADMIN_ROLES, requireRole } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { formatCents, formatDate, formatKg } from "@/lib/format";
import { FEED_CLASSIFICATION_LABELS } from "@/lib/labels";
import { getFeedStockLevels, getFeedType, listSuppliers } from "@/lib/db/feed";

export default async function FeedTypeDetailPage({ params }: PageProps<"/feed/types/[id]">) {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);
  const { id } = await params;

  const [feedType, suppliers, levels] = await Promise.all([
    getFeedType(farmId, id),
    listSuppliers(farmId, { activeOnly: true }),
    getFeedStockLevels(farmId),
  ]);

  if (!feedType) notFound();

  const stock = levels.find((level) => level.feedTypeId === feedType.id);

  return (
    <div>
      <PageHeader
        title={feedType.name}
        description={FEED_CLASSIFICATION_LABELS[feedType.classification]}
      />

      <FeedSubnav active="/feed/types" role={user.role} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Usable stock"
          value={formatKg(stock?.usableKg ?? 0)}
          hint={
            feedType.reorderLevelKg > 0
              ? `Reorder at ${formatKg(feedType.reorderLevelKg, 0)}`
              : "No reorder level set"
          }
        />
        <StatTile label="Value in store" value={formatCents(stock?.valueCents ?? 0)} />
        <StatTile
          label="Next expiry"
          value={formatDate(stock?.nextExpiryDate)}
          hint={
            stock && stock.expiredKg > 0 ? `${formatKg(stock.expiredKg)} already expired` : undefined
          }
        />
      </div>

      {stock && stock.batches.length > 0 ? (
        <Card className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Batches</h2>
          <ul className="space-y-2 text-sm">
            {stock.batches.map((batch) => (
              <li key={batch.id} className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/feed/batches/${batch.id}`}
                  className="font-medium underline decoration-zinc-300 underline-offset-2 dark:decoration-zinc-700"
                >
                  {batch.batchCode}
                </Link>
                <span className="flex items-center gap-2 tabular-nums text-zinc-600 dark:text-zinc-400">
                  {batch.expired ? <Badge variant="danger">Expired</Badge> : null}
                  {batch.expiringSoon ? <Badge variant="warning">Expiring</Badge> : null}
                  {formatKg(batch.remainingKg)} of {formatKg(batch.quantityKg)} · received{" "}
                  {formatDate(batch.receivedDate)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="mb-6">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Edit feed type
        </h2>
        <FeedTypeForm
          action={updateFeedType}
          id={feedType.id}
          suppliers={suppliers}
          defaults={feedType}
          submitLabel="Save changes"
        />
      </Card>

      <Card className="border-red-200 dark:border-red-900">
        <h2 className="mb-2 text-sm font-semibold text-red-800 dark:text-red-300">Delete</h2>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          Only possible while no batch, feeding record or programme references this feed. Once it
          has history, archive it instead — the history is the recall trail.
        </p>
        <form action={deleteFeedType}>
          <input type="hidden" name="id" value={feedType.id} />
          <SubmitButton variant="danger" pendingLabel="Deleting…">
            Delete feed type
          </SubmitButton>
        </form>
      </Card>
    </div>
  );
}
