import type { PregnancyStatus } from "@prisma/client";

import { PREGNANCY_STATUS_LABELS } from "@/lib/labels";

/** `searchParams` values arrive as `string | string[] | undefined`. */
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

/** A pregnancy status, or the "OPEN" pseudo-filter, or null. Never trusted raw. */
export function statusParam(
  value: string | string[] | undefined
): PregnancyStatus | "OPEN" | null {
  const raw = firstParam(value);
  if (!raw) return null;
  if (raw === "OPEN") return "OPEN";
  return raw in PREGNANCY_STATUS_LABELS ? (raw as PregnancyStatus) : null;
}
