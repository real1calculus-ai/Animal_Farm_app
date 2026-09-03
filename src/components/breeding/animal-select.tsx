"use client";

import { useId, useState } from "react";
import { Input, Select } from "@/components/ui/input";

export type AnimalOption = {
  id: string;
  tagNumber: string;
  name: string | null;
  breed: string;
};

/**
 * Searchable animal picker: a filter box over a native `<select>`.
 *
 * The native control is deliberate — this is used one-handed in a barn, where
 * the OS picker is bigger, faster and more forgiving than any custom listbox —
 * but a herd of 300 sows makes an unfiltered list unusable, so the text box
 * narrows it. The current selection is always kept in the option list even when
 * the filter would hide it, so typing a search can never silently clear a
 * choice the user already made.
 */
export function AnimalSelect({
  name,
  animals,
  defaultValue,
  required,
  placeholder = "Select an animal",
  id,
}: {
  name: string;
  animals: AnimalOption[];
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
  id?: string;
}) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const [query, setQuery] = useState("");
  const [value, setValue] = useState(defaultValue ?? "");

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? animals.filter((animal) =>
        [animal.tagNumber, animal.name ?? "", animal.breed]
          .join(" ")
          .toLowerCase()
          .includes(needle)
      )
    : animals;

  const selected = animals.find((animal) => animal.id === value);
  const selectedIsHidden = Boolean(selected) && !filtered.some((animal) => animal.id === value);

  return (
    <div className="space-y-2">
      <Input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Filter by tag, name or breed"
        aria-label="Filter animals"
        aria-controls={selectId}
      />
      <Select
        id={selectId}
        name={name}
        required={required}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {selectedIsHidden && selected ? (
          <option value={selected.id}>{describe(selected)}</option>
        ) : null}
        {filtered.map((animal) => (
          <option key={animal.id} value={animal.id}>
            {describe(animal)}
          </option>
        ))}
      </Select>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {needle
          ? `${filtered.length} of ${animals.length} animals match “${query.trim()}”`
          : `${animals.length} animals available`}
      </p>
    </div>
  );
}

function describe(animal: AnimalOption): string {
  return `${animal.tagNumber}${animal.name ? ` — ${animal.name}` : ""} (${animal.breed})`;
}
