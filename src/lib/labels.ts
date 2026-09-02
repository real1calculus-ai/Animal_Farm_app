/**
 * Human-readable labels for every enum in the schema, plus the option lists
 * that drive <select> inputs.
 *
 * Single source of truth on purpose: the same enum shows up in a form, a table
 * cell and a report filter, and left to itself each one drifts into its own
 * spelling ("Artificial Insemination" / "AI" / "ARTIFICIAL_INSEMINATION").
 */

export const ROLE_LABELS = {
  ADMIN: "Administrator",
  MANAGER: "Farm manager",
  VETERINARIAN: "Veterinarian",
  WORKER: "Farm worker",
} as const;

export const SEX_LABELS = { MALE: "Male", FEMALE: "Female" } as const;

export const PIG_STATUS_LABELS = {
  ACTIVE: "Active",
  SOLD: "Sold",
  DECEASED: "Deceased",
  CULLED: "Culled",
  RETIRED: "Retired",
} as const;

export const ACQUISITION_TYPE_LABELS = {
  BORN_ON_FARM: "Born on farm",
  PURCHASED: "Purchased",
} as const;

export const EXIT_REASON_LABELS = {
  SOLD: "Sold",
  DIED: "Died",
  CULLED: "Culled",
  SLAUGHTERED: "Slaughtered",
  BREEDING_RETIREMENT: "Retired from breeding",
} as const;

export const HOUSING_TYPE_LABELS = {
  FARROWING: "Farrowing",
  GESTATION: "Gestation",
  BREEDING: "Breeding",
  NURSERY: "Nursery",
  GROWER: "Grower",
  FINISHER: "Finisher",
  BOAR: "Boar",
  ISOLATION: "Isolation",
  QUARANTINE: "Quarantine",
} as const;

export const LIFE_STAGE_LABELS = {
  PIGLET: "Piglet",
  WEANER: "Weaner",
  GROWER: "Grower",
  FINISHER: "Finisher",
  GILT: "Gilt",
  SOW: "Sow",
  BOAR: "Boar",
} as const;

export const BREEDING_METHOD_LABELS = {
  NATURAL: "Natural service",
  ARTIFICIAL_INSEMINATION: "Artificial insemination",
} as const;

export const PREGNANCY_STATUS_LABELS = {
  PENDING: "Awaiting confirmation",
  CONFIRMED: "Confirmed pregnant",
  NOT_PREGNANT: "Not pregnant",
  FAILED: "Failed",
  FARROWED: "Farrowed",
  ABORTED: "Aborted",
} as const;

export const CONFIRMATION_METHOD_LABELS = {
  ULTRASOUND: "Ultrasound",
  BEHAVIORAL: "Behavioural (return to heat)",
  BLOOD_TEST: "Blood test",
  VISUAL: "Visual assessment",
} as const;

export const HEALTH_RECORD_TYPE_LABELS = {
  ILLNESS: "Illness",
  INJURY: "Injury",
  VACCINATION: "Vaccination",
  TREATMENT: "Treatment",
  EXAM: "Examination",
} as const;

export const HEALTH_CATEGORY_LABELS = {
  REPRODUCTIVE: "Reproductive",
  RESPIRATORY: "Respiratory",
  DIGESTIVE: "Digestive",
  MUSCULOSKELETAL: "Musculoskeletal",
  SKIN: "Skin / external",
  PARASITIC: "Parasitic",
  METABOLIC: "Metabolic",
  BEHAVIORAL: "Behavioural",
  OTHER: "Other",
} as const;

export const SEVERITY_LABELS = {
  MILD: "Mild",
  MODERATE: "Moderate",
  SEVERE: "Severe",
} as const;

export const HEALTH_OUTCOME_LABELS = {
  RECOVERED: "Recovered",
  ONGOING: "Ongoing",
  DEATH: "Died",
} as const;

export const MEDICATION_ROUTE_LABELS = {
  ORAL: "Oral",
  INJECTION: "Injection",
  FEED: "In feed",
  TOPICAL: "Topical",
} as const;

export const FEED_CLASSIFICATION_LABELS = {
  STARTER: "Starter",
  WEANER: "Weaner",
  GROWER: "Grower",
  FINISHER: "Finisher",
  GESTATION: "Gestation",
  LACTATION: "Lactation",
  BOAR: "Boar",
  SUPPLEMENT: "Supplement",
} as const;

export const TRANSACTION_DIRECTION_LABELS = {
  INCOME: "Income",
  EXPENSE: "Expense",
} as const;

export const TRANSACTION_CATEGORY_LABELS = {
  FEED: "Feed",
  VETERINARY: "Veterinary & health",
  LABOR: "Labour",
  HOUSING: "Housing & infrastructure",
  UTILITIES: "Utilities",
  BEDDING: "Bedding & litter",
  EQUIPMENT: "Equipment",
  BREEDING: "Breeding costs",
  TRANSPORT: "Transport",
  MARKETING: "Marketing",
  OTHER_EXPENSE: "Other expense",
  PIGLET_SALE: "Piglet sale",
  FINISHED_PIG_SALE: "Finished pig sale",
  CULL_SALE: "Cull sale",
  BREEDING_STOCK_SALE: "Breeding stock sale",
  SERVICE_INCOME: "Service income",
  OTHER_INCOME: "Other income",
} as const;

/** Which categories belong on each side of the ledger, for form filtering. */
export const EXPENSE_CATEGORIES = [
  "FEED",
  "VETERINARY",
  "LABOR",
  "HOUSING",
  "UTILITIES",
  "BEDDING",
  "EQUIPMENT",
  "BREEDING",
  "TRANSPORT",
  "MARKETING",
  "OTHER_EXPENSE",
] as const;

export const INCOME_CATEGORIES = [
  "PIGLET_SALE",
  "FINISHED_PIG_SALE",
  "CULL_SALE",
  "BREEDING_STOCK_SALE",
  "SERVICE_INCOME",
  "OTHER_INCOME",
] as const;

export const ANIMAL_SALE_TYPE_LABELS = {
  FEEDER_PIG: "Feeder pig",
  FINISHED_PIG: "Finished pig",
  BREEDING_STOCK: "Breeding stock",
  CULL: "Cull",
} as const;

export const EQUIPMENT_STATUS_LABELS = {
  IN_SERVICE: "In service",
  NEEDS_REPAIR: "Needs repair",
  RETIRED: "Retired",
} as const;

export const MAINTENANCE_TYPE_LABELS = {
  PREVENTIVE: "Preventive",
  REPAIR: "Repair",
  INSPECTION: "Inspection",
} as const;

export const PEN_TASK_TYPE_LABELS = {
  CLEANING: "Cleaning",
  DISINFECTION: "Disinfection",
  REPAIR: "Repair",
} as const;

export const HALF_SIB_POLICY_LABELS = {
  ALLOW: "Allow without warning",
  WARN: "Allow with a warning",
  BLOCK: "Block entirely",
} as const;

/** Common pig breeds, offered as suggestions rather than enforced — breed is a
 *  free-text field so a farm can record whatever it actually keeps. */
export const COMMON_BREEDS = [
  "Duroc",
  "Large White",
  "Large Black",
  "Landrace",
  "Berkshire",
  "Hampshire",
  "Pietrain",
  "Yorkshire",
  "Tamworth",
  "Chester White",
  "Crossbred",
] as const;

/** Turns a label map into `<option>` data, preserving declaration order. */
export function optionsFrom<T extends Record<string, string>>(
  labels: T
): { value: keyof T & string; label: string }[] {
  return Object.entries(labels).map(([value, label]) => ({
    value: value as keyof T & string,
    label,
  }));
}
