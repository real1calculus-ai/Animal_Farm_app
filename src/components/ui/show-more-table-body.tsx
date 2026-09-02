"use client";

import { useState, type ReactNode } from "react";
import { Tbody, Tr, Td } from "@/components/ui/table";

/**
 * Truncates a long table body to the most recent `initialCount` rows, with a
 * "Show N more" toggle to reveal the rest — built for ledger-history tables
 * that were pushing the actual "record a return/payment" form far down the
 * page on mobile. Rows arrive pre-rendered (a Server Component can hand a
 * Client Component already-built JSX as children/props, just not a function
 * — see `renderRow`-style APIs this deliberately avoids), so this stays a
 * plain data prop rather than needing a "use server" callback.
 */
export function ShowMoreTableBody({
  rows,
  colSpan,
  initialCount = 5,
}: {
  rows: ReactNode[];
  colSpan: number;
  initialCount?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = rows.length > initialCount;
  const visible = expanded ? rows : rows.slice(0, initialCount);
  const hiddenCount = rows.length - initialCount;

  return (
    <Tbody>
      {visible}
      {hasMore && (
        <Tr>
          <Td colSpan={colSpan} className="text-center">
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="text-xs font-medium text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              {expanded ? "Show fewer" : `Show ${hiddenCount} more (${rows.length} total)`}
            </button>
          </Td>
        </Tr>
      )}
    </Tbody>
  );
}
