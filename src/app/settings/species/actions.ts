"use server";

import { revalidatePath } from "next/cache";
import { ADMIN_ROLES, requireRole } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { setActiveSpecies } from "@/lib/db/species";
import type { SpeciesActionState } from "@/components/settings/species-form-state";

/**
 * Saves which species the farm keeps.
 *
 * `getAll` and not `get`: unchecked boxes are simply absent from the submission,
 * so the checked ones are the whole answer — reading a single value would turn
 * "I keep goats and pigs" into "I keep goats".
 */
export async function saveActiveSpecies(
  _prev: SpeciesActionState,
  formData: FormData
): Promise<SpeciesActionState> {
  const user = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(user);

  const ids = formData.getAll("speciesId").map(String).filter(Boolean);

  if (ids.length === 0) {
    return {
      error: "Choose at least one species. A farm with none cannot record anything.",
      success: null,
    };
  }

  const { blocked } = await setActiveSpecies(farmId, ids);

  revalidatePath("/settings/species");
  revalidatePath("/animals");
  revalidatePath("/batches");
  revalidatePath("/");

  if (blocked.length > 0) {
    return {
      error: null,
      success: `Saved. ${blocked.join(", ")} stayed on — ${
        blocked.length === 1 ? "it still has" : "they still have"
      } records on this farm, and switching it off would leave that history describing a species the farm says it never kept.`,
    };
  }

  return { error: null, success: "Saved." };
}
