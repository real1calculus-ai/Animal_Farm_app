import type { Species } from "@prisma/client";

/**
 * The species catalogue — pure data, no database access.
 *
 * Separate from `db/species.ts` because that module is `server-only`, which
 * throws the moment anything outside a server bundle imports it — including
 * the seed script. The queries stay there; the facts live here.
 *
 * Species are farm-scoped rows rather than a global enum: two farms keep
 * different animals, and a farm that starts with pigs and adds goats should
 * not need a deploy. The seeded catalogue below carries real biology — a
 * wrong gestation figure silently misdates every birth projection for that
 * species, so the defaults matter more than they look.
 */

export type SpeciesSeed = {
  name: string;
  code: string;
  trackingMode: "INDIVIDUAL" | "BATCH" | "HYBRID";
  purpose: "LIVESTOCK" | "WORKING";
  gestationDays: number | null;
  estrusCycleDays: number | null;
  weaningAgeDays: number | null;
  minBreedingAgeDaysFemale: number | null;
  minBreedingAgeDaysMale: number | null;
  minBreedingWeightKg: number | null;
  typicalLitterSize: number | null;
  hasSex: boolean;
  tracksPedigree: boolean;
  birthEventTerm: string;
  youngTerm: string;
  adultFemaleTerm: string;
  adultMaleTerm: string;
  groupTerm: string;
  bodyConditionScaleMax: number;
  notes?: string;
};

/**
 * The catalogue a new farm starts from. Figures are the standard published
 * ones; a farm can correct any of them in Settings without a migration.
 */
export const SPECIES_CATALOGUE: SpeciesSeed[] = [
  {
    name: "Pig", code: "PIG", trackingMode: "INDIVIDUAL", purpose: "LIVESTOCK",
    gestationDays: 114, estrusCycleDays: 21, weaningAgeDays: 28,
    minBreedingAgeDaysFemale: 240, minBreedingAgeDaysMale: 240,
    minBreedingWeightKg: 120, typicalLitterSize: 10,
    hasSex: true, tracksPedigree: true,
    birthEventTerm: "farrowing", youngTerm: "piglet",
    adultFemaleTerm: "sow", adultMaleTerm: "boar", groupTerm: "herd",
    bodyConditionScaleMax: 5,
  },
  {
    name: "Goat", code: "GOA", trackingMode: "INDIVIDUAL", purpose: "LIVESTOCK",
    gestationDays: 150, estrusCycleDays: 21, weaningAgeDays: 90,
    minBreedingAgeDaysFemale: 240, minBreedingAgeDaysMale: 240,
    minBreedingWeightKg: 25, typicalLitterSize: 2,
    hasSex: true, tracksPedigree: true,
    birthEventTerm: "kidding", youngTerm: "kid",
    adultFemaleTerm: "doe", adultMaleTerm: "buck", groupTerm: "herd",
    bodyConditionScaleMax: 5,
  },
  {
    name: "Sheep", code: "SHE", trackingMode: "INDIVIDUAL", purpose: "LIVESTOCK",
    gestationDays: 147, estrusCycleDays: 17, weaningAgeDays: 60,
    minBreedingAgeDaysFemale: 240, minBreedingAgeDaysMale: 240,
    minBreedingWeightKg: 30, typicalLitterSize: 2,
    hasSex: true, tracksPedigree: true,
    birthEventTerm: "lambing", youngTerm: "lamb",
    adultFemaleTerm: "ewe", adultMaleTerm: "ram", groupTerm: "flock",
    bodyConditionScaleMax: 5,
  },
  {
    name: "Cattle", code: "CAT", trackingMode: "INDIVIDUAL", purpose: "LIVESTOCK",
    gestationDays: 283, estrusCycleDays: 21, weaningAgeDays: 180,
    minBreedingAgeDaysFemale: 450, minBreedingAgeDaysMale: 450,
    minBreedingWeightKg: 250, typicalLitterSize: 1,
    hasSex: true, tracksPedigree: true,
    birthEventTerm: "calving", youngTerm: "calf",
    adultFemaleTerm: "cow", adultMaleTerm: "bull", groupTerm: "herd",
    // Cattle are scored 1–9, not 1–5. Scoring a cow on the pig scale is not a
    // rounding error — it changes what "thin" means.
    bodyConditionScaleMax: 9,
  },
  {
    name: "Rabbit", code: "RAB", trackingMode: "HYBRID", purpose: "LIVESTOCK",
    gestationDays: 31, estrusCycleDays: null, weaningAgeDays: 30,
    minBreedingAgeDaysFemale: 150, minBreedingAgeDaysMale: 180,
    minBreedingWeightKg: 2.5, typicalLitterSize: 8,
    hasSex: true, tracksPedigree: true,
    birthEventTerm: "kindling", youngTerm: "kit",
    adultFemaleTerm: "doe", adultMaleTerm: "buck", groupTerm: "colony",
    bodyConditionScaleMax: 5,
    notes: "Induced ovulator — there is no fixed heat cycle to predict, so breeding is scheduled rather than observed. Does are tracked individually, fryers as litters.",
  },
  {
    name: "Grasscutter", code: "GRC", trackingMode: "HYBRID", purpose: "LIVESTOCK",
    gestationDays: 152, estrusCycleDays: null, weaningAgeDays: 40,
    minBreedingAgeDaysFemale: 240, minBreedingAgeDaysMale: 270,
    minBreedingWeightKg: 2, typicalLitterSize: 5,
    hasSex: true, tracksPedigree: true,
    birthEventTerm: "parturition", youngTerm: "pup",
    adultFemaleTerm: "dam", adultMaleTerm: "sire", groupTerm: "colony",
    bodyConditionScaleMax: 5,
    notes: "Colony-bred, typically one male to four or five females, so matings are attributed to the colony rather than to an observed pairing.",
  },
  {
    name: "Broiler chicken", code: "BRO", trackingMode: "BATCH", purpose: "LIVESTOCK",
    gestationDays: 21, estrusCycleDays: null, weaningAgeDays: null,
    minBreedingAgeDaysFemale: null, minBreedingAgeDaysMale: null,
    minBreedingWeightKg: null, typicalLitterSize: null,
    hasSex: false, tracksPedigree: false,
    birthEventTerm: "hatching", youngTerm: "chick",
    adultFemaleTerm: "hen", adultMaleTerm: "cockerel", groupTerm: "flock",
    bodyConditionScaleMax: 5,
    notes: "Stocked as day-olds and sold as a batch at 6–8 weeks. The 21 days is incubation, not gestation.",
  },
  {
    name: "Layer chicken", code: "LAY", trackingMode: "BATCH", purpose: "LIVESTOCK",
    gestationDays: 21, estrusCycleDays: null, weaningAgeDays: null,
    minBreedingAgeDaysFemale: 140, minBreedingAgeDaysMale: null,
    minBreedingWeightKg: null, typicalLitterSize: null,
    hasSex: false, tracksPedigree: false,
    birthEventTerm: "hatching", youngTerm: "pullet",
    adultFemaleTerm: "hen", adultMaleTerm: "cockerel", groupTerm: "flock",
    bodyConditionScaleMax: 5,
    notes: "Judged on lay percentage rather than weight gain. Point of lay is around 18–20 weeks.",
  },
  {
    name: "Catfish", code: "CFH", trackingMode: "BATCH", purpose: "LIVESTOCK",
    gestationDays: null, estrusCycleDays: null, weaningAgeDays: null,
    minBreedingAgeDaysFemale: null, minBreedingAgeDaysMale: null,
    minBreedingWeightKg: null, typicalLitterSize: null,
    hasSex: false, tracksPedigree: false,
    birthEventTerm: "spawning", youngTerm: "fingerling",
    adultFemaleTerm: "female", adultMaleTerm: "male", groupTerm: "pond",
    bodyConditionScaleMax: 5,
    notes: "Stocked by count into a pond and harvested by biomass. Water quality drives mortality more than anything else.",
  },
  {
    name: "Snail", code: "SNA", trackingMode: "BATCH", purpose: "LIVESTOCK",
    gestationDays: null, estrusCycleDays: null, weaningAgeDays: null,
    minBreedingAgeDaysFemale: null, minBreedingAgeDaysMale: null,
    minBreedingWeightKg: null, typicalLitterSize: null,
    // Hermaphrodites. Recording a sex would be recording a fiction.
    hasSex: false, tracksPedigree: false,
    birthEventTerm: "laying", youngTerm: "hatchling",
    adultFemaleTerm: "adult", adultMaleTerm: "adult", groupTerm: "pen",
    bodyConditionScaleMax: 5,
  },
  {
    name: "Dog", code: "DOG", trackingMode: "INDIVIDUAL", purpose: "WORKING",
    gestationDays: 63, estrusCycleDays: 180, weaningAgeDays: 56,
    minBreedingAgeDaysFemale: 540, minBreedingAgeDaysMale: 540,
    minBreedingWeightKg: null, typicalLitterSize: 6,
    hasSex: true, tracksPedigree: true,
    birthEventTerm: "whelping", youngTerm: "puppy",
    adultFemaleTerm: "bitch", adultMaleTerm: "dog", groupTerm: "pack",
    bodyConditionScaleMax: 9,
    notes: "Kept for farm security, not production. Excluded from feed-conversion, profitability and sale reporting; rabies vaccination is the record that matters.",
  },
];

/** Species-aware terminology, for screens that should read like the animal. */
export function speciesTerms(species: Pick<Species,
  "birthEventTerm" | "youngTerm" | "adultFemaleTerm" | "adultMaleTerm" | "groupTerm">) {
  return {
    birth: species.birthEventTerm,
    young: species.youngTerm,
    female: species.adultFemaleTerm,
    male: species.adultMaleTerm,
    group: species.groupTerm,
  };
}
