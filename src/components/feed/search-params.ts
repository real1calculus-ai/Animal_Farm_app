import type { FeedClassification } from "@prisma/client";
import { FEED_CLASSIFICATION_LABELS } from "@/lib/labels";

/**
 * `searchParams` are attacker-controlled, so anything that reaches a Prisma
 * `where` clause is validated here first. An unrecognised value degrades to
 * "no filter" rather than throwing — a stale bookmark should show the list,
 * not an error page.
 */
export function firstParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

export function classificationParam(
  value: string | string[] | undefined
): FeedClassification | null {
  const raw = firstParam(value);
  if (!raw) return null;
  return raw in FEED_CLASSIFICATION_LABELS ? (raw as FeedClassification) : null;
}

const BATCH_VIEWS = ["all", "in-stock", "expired", "expiring"] as const;
export type BatchView = (typeof BATCH_VIEWS)[number];

export function batchViewParam(value: string | string[] | undefined): BatchView {
  const raw = firstParam(value);
  return BATCH_VIEWS.includes(raw as BatchView) ? (raw as BatchView) : "in-stock";
}

/** Analysis window in days, clamped to something a report can actually cover. */
export function windowDaysParam(value: string | string[] | undefined, fallback = 90): number {
  const raw = firstParam(value);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(730, Math.max(7, parsed));
}
