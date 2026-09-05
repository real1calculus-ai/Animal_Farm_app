import { toDateInputValue } from "@/lib/format";

/**
 * Shared shape for the animal module's `useActionState` forms.
 *
 * The actions return a message instead of throwing so a fixable mistake — a
 * duplicate tag number, a dam younger than her own offspring — is answered
 * next to the field that caused it rather than replacing the half-filled form
 * with an error page. Genuinely exceptional failures still throw.
 */
export type AnimalActionState = {
  error: string | null;
  /** Set by the actions that stay on the page, so a successful save is visible. */
  success?: string | null;
};

export const EMPTY_ACTION_STATE: AnimalActionState = { error: null };

/**
 * The animal form's values as plain strings — the shape a Server Component can
 * hand across the boundary to the client form, with dates already rendered for
 * `<input type="date">` and money already converted out of minor units.
 */
export type AnimalFormValues = {
  id: string;
  tagNumber: string;
  name: string;
  breed: string;
  dateOfBirth: string;
  sex: string;
  status: string;
  motherId: string;
  fatherId: string;
  penId: string;
  birthWeightKg: string;
  markings: string;
  currentWeightKg: string;
  bodyConditionScore: string;
  congenitalDefects: string;
  phenotypeNotes: string;
  acquisitionType: string;
  dateAcquired: string;
  acquisitionCost: string;
  dateExit: string;
  exitReason: string;
  exitNotes: string;
};

type AnimalRowLike = {
  id: string;
  tagNumber: string;
  name: string | null;
  breed: string;
  dateOfBirth: Date;
  sex: string;
  status: string;
  motherId: string | null;
  fatherId: string | null;
  penId: string | null;
  birthWeightKg: number | null;
  markings: string | null;
  currentWeightKg: number | null;
  bodyConditionScore: number | null;
  congenitalDefects: string | null;
  phenotypeNotes: string | null;
  acquisitionType: string;
  dateAcquired: Date;
  acquisitionCostCents: number | null;
  dateExit: Date | null;
  exitReason: string | null;
  exitNotes: string | null;
};

const num = (value: number | null): string => (value === null ? "" : String(value));

export function animalFormValues(animal: AnimalRowLike | null): AnimalFormValues {
  const today = toDateInputValue(new Date());

  if (!animal) {
    return {
      id: "",
      tagNumber: "",
      name: "",
      breed: "",
      dateOfBirth: "",
      sex: "FEMALE",
      status: "ACTIVE",
      motherId: "",
      fatherId: "",
      penId: "",
      birthWeightKg: "",
      markings: "",
      currentWeightKg: "",
      bodyConditionScore: "",
      congenitalDefects: "",
      phenotypeNotes: "",
      acquisitionType: "BORN_ON_FARM",
      dateAcquired: today,
      acquisitionCost: "",
      dateExit: "",
      exitReason: "",
      exitNotes: "",
    };
  }

  return {
    id: animal.id,
    tagNumber: animal.tagNumber,
    name: animal.name ?? "",
    breed: animal.breed,
    dateOfBirth: toDateInputValue(animal.dateOfBirth),
    sex: animal.sex,
    status: animal.status,
    motherId: animal.motherId ?? "",
    fatherId: animal.fatherId ?? "",
    penId: animal.penId ?? "",
    birthWeightKg: num(animal.birthWeightKg),
    markings: animal.markings ?? "",
    currentWeightKg: num(animal.currentWeightKg),
    bodyConditionScore: num(animal.bodyConditionScore),
    congenitalDefects: animal.congenitalDefects ?? "",
    phenotypeNotes: animal.phenotypeNotes ?? "",
    acquisitionType: animal.acquisitionType,
    dateAcquired: toDateInputValue(animal.dateAcquired),
    acquisitionCost:
      animal.acquisitionCostCents === null ? "" : (animal.acquisitionCostCents / 100).toFixed(2),
    dateExit: toDateInputValue(animal.dateExit),
    exitReason: animal.exitReason ?? "",
    exitNotes: animal.exitNotes ?? "",
  };
}

/** A parent picker option. Dates are ISO day strings so the client can compare
 *  them against the `<input type="date">` value without re-parsing. */
export type ParentCandidate = {
  id: string;
  tagNumber: string;
  name: string | null;
  sex: string;
  status: string;
  breed: string;
  dateOfBirth: string;
};

export function toParentCandidate(animal: {
  id: string;
  tagNumber: string;
  name: string | null;
  sex: string;
  status: string;
  breed: string;
  dateOfBirth: Date;
}): ParentCandidate {
  return { ...animal, dateOfBirth: toDateInputValue(animal.dateOfBirth) };
}
