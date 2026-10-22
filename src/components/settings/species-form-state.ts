/**
 * Shared state shape for the species form.
 *
 * Lives here rather than beside the action because a `"use server"` module may
 * only export async functions — exporting the initial-state constant from
 * actions.ts compiles cleanly and then fails the build at page-data collection
 * with "a 'use server' file can only export async functions, found object".
 * Same reason src/components/animals/form-state.ts exists.
 */
export type SpeciesActionState = {
  error: string | null;
  success: string | null;
};

export const EMPTY_SPECIES_STATE: SpeciesActionState = { error: null, success: null };
