"use client";

import { useId, useMemo, useState } from "react";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import type { ParentCandidate } from "@/components/animals/form-state";

/**
 * Searchable parent picker.
 *
 * A herd of a few hundred animals is too many for a bare `<select>` to be
 * usable one-handed, but small enough that the whole candidate list can be
 * shipped once and narrowed in the browser — no round trip per keystroke in a
 * barn with one bar of signal.
 *
 * The list only offers plausible parents: the right sex, born before the
 * animal itself, and never the animal or one of its own descendants. That is a
 * convenience, not the guarantee — `validateParentage()` re-checks all of it
 * server-side, because a hand-crafted POST never touches this component.
 */
export function ParentSelect({
  name,
  label,
  hint,
  sex,
  candidates,
  value,
  onChange,
  childDateOfBirth,
  excludeIds,
}: {
  name: string;
  label: string;
  hint?: string;
  sex: "FEMALE" | "MALE";
  candidates: ParentCandidate[];
  value: string;
  onChange: (value: string) => void;
  /** yyyy-mm-dd, straight from the form's date input. */
  childDateOfBirth: string;
  excludeIds: string[];
}) {
  const fieldId = useId();
  const [query, setQuery] = useState("");

  const excluded = useMemo(() => new Set(excludeIds), [excludeIds]);

  const eligible = useMemo(
    () =>
      candidates.filter((candidate) => {
        if (candidate.sex !== sex) return false;
        if (excluded.has(candidate.id)) return false;
        // ISO day strings compare lexicographically, so no Date parsing here.
        if (childDateOfBirth && candidate.dateOfBirth > childDateOfBirth) return false;
        return true;
      }),
    [candidates, sex, excluded, childDateOfBirth]
  );

  const matching = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = needle
      ? eligible.filter(
          (candidate) =>
            candidate.tagNumber.toLowerCase().includes(needle) ||
            (candidate.name ?? "").toLowerCase().includes(needle)
        )
      : eligible;

    // Keep whatever is currently selected visible even when the search text or
    // a changed birth date would filter it out — dropping it silently would
    // clear the selection on submit without anyone noticing.
    if (value && !rows.some((row) => row.id === value)) {
      const selected = candidates.find((candidate) => candidate.id === value);
      if (selected) return [selected, ...rows];
    }
    return rows;
  }, [eligible, query, value, candidates]);

  const selected = candidates.find((candidate) => candidate.id === value) ?? null;
  const selectedIneligible = selected !== null && !eligible.some((row) => row.id === selected.id);

  return (
    <Field label={label} htmlFor={fieldId} hint={hint}>
      <div className="flex flex-col gap-2">
        <Input
          type="search"
          inputMode="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${sex === "FEMALE" ? "dams" : "sires"} by tag or name`}
          aria-label={`Search ${label.toLowerCase()}`}
        />
        <Select
          id={fieldId}
          name={name}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Unknown / not recorded</option>
          {matching.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.tagNumber}
              {candidate.name ? ` — ${candidate.name}` : ""} ({candidate.breed}, born{" "}
              {candidate.dateOfBirth})
            </option>
          ))}
        </Select>
      </div>

      {selectedIneligible ? (
        <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
          {selected?.tagNumber} is no longer a valid {sex === "FEMALE" ? "dam" : "sire"} for this
          animal — check the birth dates. Saving will be rejected.
        </p>
      ) : null}

      {eligible.length === 0 ? (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {childDateOfBirth
            ? `No ${sex === "FEMALE" ? "female" : "male"} animal on record was born before this one.`
            : "Enter a date of birth to see eligible animals."}
        </p>
      ) : null}
    </Field>
  );
}
