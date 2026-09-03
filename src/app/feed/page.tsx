import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/ui/stat-tile";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { FeedSubnav } from "@/components/feed/feed-subnav";
import { StockBar } from "@/components/feed/stock-bar";
import { writeOffBatch } from "@/app/feed/actions";
import { ADMIN_ROLES, requireUser } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { formatCents, formatDate, formatKg, daysBetween } from "@/lib/format";
import { FEED_CLASSIFICATION_LABELS } from "@/lib/labels";
import { EXPIRY_WARNING_DAYS, getFeedStockLevels, summariseStock } from "@/lib/db/feed";

/**
 * Feed inventory — the reorder-decision screen.
 *
 * Three things sit above the stock table, and all three are about a decision
 * that has to be made today: what to reorder, what to use before it turns, and
 * what has already turned. Stock that has expired is counted separately from
 * usable stock everywhere on this page. A store holding 400 kg of out-of-date
 * starter is out of starter as far as any decision goes, and a single "in
 * stock" figure that includes it is how a farm arrives at Monday morning with
 * nothing it can legally feed.
 */
export default async function FeedInventoryPage() {
  const user = await requireUser();
  const farmId = await getActiveFarmId(user);
  const canManage = ADMIN_ROLES.includes(user.role);

  const now = new Date();
  const levels = await getFeedStockLevels(farmId, now);
  const summary = summariseStock(levels);

  const active = levels.filter((level) => level.isActive);
  const reorder = active.filter((level) => level.belowReorderLevel || level.outOfStock);

  const flatBatches = levels.flatMap((level) =>
    level.batches
      .filter((batch) => batch.remainingKg > 0)
      .map((batch) => ({ ...batch, feedTypeName: level.name }))
  );
  const expired = flatBatches
    .filter((batch) => batch.expired)
    .sort((a, b) => (a.expirationDate?.getTime() ?? 0) - (b.expirationDate?.getTime() ?? 0));
  const expiringSoon = flatBatches
    .filter((batch) => batch.expiringSoon)
    .sort((a, b) => (a.expirationDate?.getTime() ?? 0) - (b.expirationDate?.getTime() ?? 0));

  return (
    <div>
      <PageHeader
        title="Feed inventory"
        description="Stock on hand, what needs reordering, and what needs using before it turns."
        actions={
          canManage ? (
            <>
              <ButtonLink href="/feed/deliveries">Record delivery</ButtonLink>
              <ButtonLink href="/feed/records" variant="secondary">
                Log feeding
              </ButtonLink>
            </>
          ) : (
            <ButtonLink href="/feed/records">Log feeding</ButtonLink>
          )
        }
      />

      <FeedSubnav active="/feed" role={user.role} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Usable stock"
          value={formatKg(summary.usableKg, 0)}
          hint={`Across ${summary.feedTypeCount} active feed ${summary.feedTypeCount === 1 ? "type" : "types"}`}
        />
        <StatTile
          label="Value in store"
          value={formatCents(summary.valueCents)}
          hint="At the price each batch was bought for"
        />
        <StatTile
          label="Needs reordering"
          value={String(summary.reorderCount)}
          hint={
            summary.outOfStockCount > 0
              ? `${summary.outOfStockCount} completely out`
              : "Below the reorder level"
          }
        />
        <StatTile
          label="Expiring soon"
          value={String(summary.expiringSoonCount)}
          hint={`Batches within ${EXPIRY_WARNING_DAYS} days`}
        />
      </div>

      {reorder.length > 0 ? (
        <Card className="mb-6 border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30">
          <h2 className="mb-3 text-sm font-semibold text-red-900 dark:text-red-300">
            Reorder now — {reorder.length} {reorder.length === 1 ? "feed is" : "feeds are"} at or
            below the reorder level
          </h2>
          <ul className="space-y-2">
            {reorder.map((level) => (
              <li
                key={level.feedTypeId}
                className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
              >
                <span className="font-medium text-red-900 dark:text-red-200">
                  {level.name}
                  {level.supplierName ? (
                    <span className="ml-2 font-normal text-red-700 dark:text-red-400">
                      {level.supplierName}
                    </span>
                  ) : null}
                </span>
                <span className="tabular-nums text-red-800 dark:text-red-300">
                  {level.outOfStock ? (
                    <strong>Out of stock</strong>
                  ) : (
                    <>
                      {formatKg(level.usableKg)} left of {formatKg(level.reorderLevelKg, 0)} minimum
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {expired.length > 0 ? (
        <Card className="mb-6 border-zinc-400 dark:border-zinc-600">
          <h2 className="mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Expired stock — {formatKg(summary.expiredKg)} worth {formatCents(summary.expiredValueCents)}
          </h2>
          <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
            This feed is still on the shelf but cannot be allocated to animals. Write it off so the
            stock figure matches what is actually feedable.
          </p>
          <Table>
            <Thead>
              <Tr>
                <Th>Batch</Th>
                <Th>Feed</Th>
                <Th>Expired</Th>
                <Th className="text-right">Remaining</Th>
                {canManage ? <Th className="text-right">Action</Th> : null}
              </Tr>
            </Thead>
            <Tbody>
              {expired.map((batch) => (
                <Tr key={batch.id}>
                  <Td>
                    <Link
                      href={`/feed/batches/${batch.id}`}
                      className="font-medium underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-900 dark:decoration-zinc-700 dark:hover:decoration-zinc-100"
                    >
                      {batch.batchCode}
                    </Link>
                  </Td>
                  <Td>{batch.feedTypeName}</Td>
                  <Td>
                    {formatDate(batch.expirationDate)}
                    <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                      {batch.expirationDate
                        ? `${daysBetween(batch.expirationDate, now)} d ago`
                        : null}
                    </span>
                  </Td>
                  <Td className="text-right tabular-nums">{formatKg(batch.remainingKg)}</Td>
                  {canManage ? (
                    <Td className="text-right">
                      <form action={writeOffBatch}>
                        <input type="hidden" name="id" value={batch.id} />
                        <input type="hidden" name="reason" value="expired" />
                        <SubmitButton variant="secondary" pendingLabel="Writing off…">
                          Write off
                        </SubmitButton>
                      </form>
                    </Td>
                  ) : null}
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      ) : null}

      {expiringSoon.length > 0 ? (
        <Card className="mb-6 border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <h2 className="mb-3 text-sm font-semibold text-amber-900 dark:text-amber-300">
            Use within {EXPIRY_WARNING_DAYS} days
          </h2>
          <ul className="space-y-1.5 text-sm">
            {expiringSoon.map((batch) => (
              <li key={batch.id} className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/feed/batches/${batch.id}`}
                  className="font-medium text-amber-900 underline decoration-amber-300 underline-offset-2 dark:text-amber-200"
                >
                  {batch.batchCode}
                  <span className="ml-2 font-normal">{batch.feedTypeName}</span>
                </Link>
                <span className="tabular-nums text-amber-800 dark:text-amber-300">
                  {formatKg(batch.remainingKg)} · expires {formatDate(batch.expirationDate)}
                  {batch.expirationDate
                    ? ` (${daysBetween(now, batch.expirationDate)} d)`
                    : null}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Stock by feed type
        </h2>

        {levels.length === 0 ? (
          <EmptyState
            title="No feed types set up yet"
            description="A feed type is the product you buy — its nutritional profile, price and reorder level. Deliveries are recorded against one."
            action={
              ADMIN_ROLES.includes(user.role) ? (
                <ButtonLink href="/feed/types">Add a feed type</ButtonLink>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Feed</Th>
                <Th>Stock</Th>
                <Th className="text-right">Usable</Th>
                <Th className="text-right">Value</Th>
                <Th>Next expiry</Th>
                <Th>Last received</Th>
              </Tr>
            </Thead>
            <Tbody>
              {levels.map((level) => (
                <Tr key={level.feedTypeId} className={level.isActive ? "" : "opacity-60"}>
                  <Td>
                    <Link
                      href={`/feed/types/${level.feedTypeId}`}
                      className="font-medium underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-900 dark:decoration-zinc-700 dark:hover:decoration-zinc-100"
                    >
                      {level.name}
                    </Link>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <Badge>{FEED_CLASSIFICATION_LABELS[level.classification]}</Badge>
                      {level.outOfStock ? (
                        <Badge variant="danger">Out of stock</Badge>
                      ) : level.belowReorderLevel ? (
                        <Badge variant="danger">Reorder</Badge>
                      ) : null}
                      {level.expiredKg > 0 ? (
                        <Badge variant="warning">{formatKg(level.expiredKg, 0)} expired</Badge>
                      ) : null}
                      {!level.isActive ? <Badge>Archived</Badge> : null}
                    </span>
                  </Td>
                  <Td className="min-w-32">
                    <StockBar
                      usableKg={level.usableKg}
                      reorderLevelKg={level.reorderLevelKg}
                      expiredKg={level.expiredKg}
                    />
                    {level.reorderLevelKg > 0 ? (
                      <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                        Reorder at {formatKg(level.reorderLevelKg, 0)}
                      </span>
                    ) : null}
                  </Td>
                  <Td className="text-right tabular-nums font-medium">
                    {formatKg(level.usableKg)}
                  </Td>
                  <Td className="text-right tabular-nums">{formatCents(level.valueCents)}</Td>
                  <Td>{formatDate(level.nextExpiryDate)}</Td>
                  <Td>{formatDate(level.lastReceivedDate)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
