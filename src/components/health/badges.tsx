import type { HealthCategory, HealthOutcome, Severity } from "@prisma/client";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import {
  HEALTH_CATEGORY_LABELS,
  HEALTH_OUTCOME_LABELS,
  SEVERITY_LABELS,
} from "@/lib/labels";
import type { VaccinationDueStatus } from "@/lib/db/health";

type Variant = NonNullable<BadgeProps["variant"]>;

const SEVERITY_VARIANTS: Record<Severity, Variant> = {
  MILD: "default",
  MODERATE: "warning",
  SEVERE: "danger",
};

const OUTCOME_VARIANTS: Record<HealthOutcome, Variant> = {
  RECOVERED: "success",
  ONGOING: "warning",
  DEATH: "danger",
};

const DUE_VARIANTS: Record<VaccinationDueStatus, Variant> = {
  OVERDUE: "danger",
  DUE: "warning",
  UPCOMING: "default",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <Badge variant={SEVERITY_VARIANTS[severity]}>{SEVERITY_LABELS[severity]}</Badge>;
}

export function OutcomeBadge({ outcome }: { outcome: HealthOutcome }) {
  return <Badge variant={OUTCOME_VARIANTS[outcome]}>{HEALTH_OUTCOME_LABELS[outcome]}</Badge>;
}

export function CategoryBadge({ category }: { category: HealthCategory }) {
  return <Badge>{HEALTH_CATEGORY_LABELS[category]}</Badge>;
}

export function VaccinationStatusBadge({ status }: { status: VaccinationDueStatus }) {
  const text = status === "OVERDUE" ? "Overdue" : status === "DUE" ? "Due now" : "Upcoming";
  return <Badge variant={DUE_VARIANTS[status]}>{text}</Badge>;
}

/**
 * Row tint for a table, mirroring the badge. Severity is not only a label on
 * this screen — a severe, still-ongoing case has to be findable by someone
 * scanning the list at arm's length, not by reading every row.
 */
export function severityRowClasses(severity: Severity, outcome: HealthOutcome): string {
  if (outcome !== "ONGOING") return "";
  if (severity === "SEVERE") return "bg-red-50/70 dark:bg-red-950/30";
  if (severity === "MODERATE") return "bg-amber-50/60 dark:bg-amber-950/20";
  return "";
}
