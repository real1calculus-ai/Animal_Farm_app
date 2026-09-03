import type { PregnancyStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { PREGNANCY_STATUS_LABELS } from "@/lib/labels";

const STATUS_VARIANTS: Record<PregnancyStatus, "default" | "warning" | "danger" | "success"> = {
  PENDING: "warning",
  CONFIRMED: "success",
  NOT_PREGNANT: "default",
  FAILED: "danger",
  FARROWED: "success",
  ABORTED: "danger",
};

export function PregnancyStatusBadge({ status }: { status: PregnancyStatus }) {
  return <Badge variant={STATUS_VARIANTS[status]}>{PREGNANCY_STATUS_LABELS[status]}</Badge>;
}

/**
 * "14 days to go" / "5 days OVERDUE". The farrowing shed works off this column,
 * so overdue is loud: a sow past her date with nobody watching is the single
 * most expensive thing this screen can fail to say.
 */
export function DueCountdown({
  expectedFarrowingDate,
  status,
  toleranceDays,
  now = new Date(),
}: {
  expectedFarrowingDate: Date;
  status: PregnancyStatus;
  toleranceDays: number;
  now?: Date;
}) {
  if (status === "FARROWED") {
    return <span className="text-zinc-500 dark:text-zinc-400">Farrowed</span>;
  }
  if (status !== "PENDING" && status !== "CONFIRMED") {
    return <span className="text-zinc-400 dark:text-zinc-500">—</span>;
  }

  const days = Math.ceil((expectedFarrowingDate.getTime() - now.getTime()) / 86_400_000);

  if (days < -toleranceDays) {
    return (
      <span className="font-semibold text-red-700 dark:text-red-400">
        {Math.abs(days)} days OVERDUE
      </span>
    );
  }
  if (days < 0) {
    return (
      <span className="font-medium text-amber-700 dark:text-amber-400">
        {Math.abs(days)} days past date
      </span>
    );
  }
  if (days === 0) {
    return <span className="font-semibold text-amber-700 dark:text-amber-400">Due today</span>;
  }
  if (days <= 7) {
    return (
      <span className="font-medium text-amber-700 dark:text-amber-400">
        {days} day{days === 1 ? "" : "s"} to go
      </span>
    );
  }
  return (
    <span className="text-zinc-700 dark:text-zinc-300">
      {days} days to go
    </span>
  );
}

/** Row tint for the list and calendar: overdue red, due-this-week amber. */
export function dueRowClasses({
  expectedFarrowingDate,
  status,
  toleranceDays,
  now = new Date(),
}: {
  expectedFarrowingDate: Date;
  status: PregnancyStatus;
  toleranceDays: number;
  now?: Date;
}): string {
  if (status !== "PENDING" && status !== "CONFIRMED") return "";
  const days = Math.ceil((expectedFarrowingDate.getTime() - now.getTime()) / 86_400_000);
  if (days < -toleranceDays) return "bg-red-50 dark:bg-red-950/30";
  if (days <= 7) return "bg-amber-50 dark:bg-amber-950/30";
  return "";
}
