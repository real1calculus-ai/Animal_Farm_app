/**
 * Age from a day count.
 *
 * The match finder hands back `ageDays` rather than a birth date, and turning
 * that back into a `Date` to reuse `formatAge` means calling `Date.now()`
 * during render — impure, and flagged as such. This is the same ladder of units
 * as `formatAge`, driven by the number the engine actually returned.
 */
export function formatAgeFromDays(days: number): string {
  if (days < 0) return "—";
  if (days < 14) return `${days} d`;
  if (days < 120) return `${Math.floor(days / 7)} wk`;

  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  if (years < 1) return `${Math.floor(days / 30)} mo`;
  return months > 0 ? `${years} yr ${months} mo` : `${years} yr`;
}
