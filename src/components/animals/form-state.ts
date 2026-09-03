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

export function animalFormValues(pig: AnimalRowLike | null): AnimalFormValues {
  const today = toDateInputValue(new Date());

  if (!pig) {
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
    id: pig.id,
    tagNumber: pig.tagNumber,
    name: pig.name ?? "",
    breed: pig.breed,
    dateOfBirth: toDateInputValue(pig.dateOfBirth),
    sex: pig.sex,
    status: pig.status,
    motherId: pig.motherId ?? "",
    fatherId: pig.fatherId ?? "",
    penId: pig.penId ?? "",
    birthWeightKg: num(pig.birthWeightKg),
    markings: pig.markings ?? "",
    currentWeightKg: num(pig.currentWeightKg),
    bodyConditionScore: num(pig.bodyConditionScore),
    congenitalDefects: pig.congenitalDefects ?? "",
    phenotypeNotes: pig.phenotypeNotes ?? "",
    acquisitionType: pig.acquisitionType,
    dateAcquired: toDateInputValue(pig.dateAcquired),
    acquisitionCost:
      pig.acquisitionCostCents === null ? "" : (pig.acquisitionCostCents / 100).toFixed(2),
    dateExit: toDateInputValue(pig.dateExit),
    exitReason: pig.exitReason ?? "",
    exitNotes: pig.exitNotes ?? "",
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

export function toParentCandidate(pig: {
  id: string;
  tagNumber: string;
  name: string | null;
  sex: string;
  status: string;
  breed: string;
  dateOfBirth: Date;
}): ParentCandidate {
  return { ...pig, dateOfBirth: toDateInputValue(pig.dateOfBirth) };
}
