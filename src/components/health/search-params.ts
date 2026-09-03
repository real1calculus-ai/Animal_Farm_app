import type {
  HealthCategory,
  HealthOutcome,
  HealthRecordType,
  Severity,
} from "@prisma/client";

import {
  HEALTH_CATEGORY_LABELS,
  HEALTH_OUTCOME_LABELS,
  HEALTH_RECORD_TYPE_LABELS,
  SEVERITY_LABELS,
} from "@/lib/labels";

/**
 * `searchParams` arrive as `string | string[] | undefined` and are entirely
 * attacker-controlled, so every enum-shaped filter is validated against the
 * label map before it can reach a Prisma `where` clause. An unrecognised value
 * degrades to "no filter" rather than throwing — a stale bookmark should show
 * the list, not an error page.
 */
export function firstParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

export function dateParam(value: string | string[] | undefined): Date | null {
  const raw = firstParam(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function enumParam<T extends string>(
  value: string | string[] | undefined,
  labels: Record<T, string>
): T | null {
  const raw = firstParam(value);
  if (!raw) return null;
  return raw in labels ? (raw as T) : null;
}

export function categoryParam(value: string | string[] | undefined): HealthCategory | null {
  return enumParam(value, HEALTH_CATEGORY_LABELS);
}

export function severityParam(value: string | string[] | undefined): Severity | null {
  return enumParam(value, SEVERITY_LABELS);
}

export function outcomeParam(value: string | string[] | undefined): HealthOutcome | null {
  return enumParam(value, HEALTH_OUTCOME_LABELS);
}

export function recordTypeParam(value: string | string[] | undefined): HealthRecordType | null {
  return enumParam(value, HEALTH_RECORD_TYPE_LABELS);
}
