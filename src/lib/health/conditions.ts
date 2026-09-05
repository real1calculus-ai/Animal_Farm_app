import type { HealthCategory, HealthRecordType, Severity } from "@prisma/client";

/**
 * Curated list of the conditions a animal unit actually sees, grouped by
 * `HealthCategory`.
 *
 * Two jobs, and the second is the important one:
 *
 * 1. Quick entry (§3.2): pick a condition and the form pre-fills the likely
 *    signs and first-line treatment, so a worker on a phone in a barn types a
 *    sentence instead of a paragraph.
 *
 * 2. Normalising `HealthRecord.diagnosis`. The outbreak detector clusters on
 *    that string. Left as free text it arrives as "scours", "Scours",
 *    "diarrhoea", "the runs" — four spellings of one disease, none of which
 *    reach the 3-cases-in-7-days threshold, and the alert never fires. A
 *    canonical label per condition is what makes clustering mean anything.
 *
 * The list is suggestions, not a closed enum: `diagnosis` stays a String
 * column so a farm can record something this list has never heard of. What
 * the list guarantees is that the *common* cases spell themselves the same
 * way every time.
 */

export type Condition = {
  /** Canonical string written to `HealthRecord.diagnosis`. */
  diagnosis: string;
  category: HealthCategory;
  /** Default record type on the entry form. */
  recordType: HealthRecordType;
  /** Severity this usually presents at — the operator can override. */
  typicalSeverity: Severity;
  /** Presenting signs, shown as a hint under the diagnosis field. */
  signs: string[];
  /** First-line treatments, pre-filled into the treatment field. */
  treatments: string[];
  /** Pre-ticks "antibiotic" on the first medication row. */
  antibioticLikely: boolean;
  /**
   * Spreads animal-to-animal. Drives the isolation recommendation on an
   * outbreak alert — a tail-biting cluster is a housing problem, a pneumonia
   * cluster is a biosecurity one, and the advice differs completely.
   */
  contagious: boolean;
  /** Alternative spellings, so free text can still be matched to the canon. */
  aliases?: string[];
};

export const CONDITIONS: readonly Condition[] = [
  // --- Respiratory --------------------------------------------------------
  {
    diagnosis: "Pneumonia",
    category: "RESPIRATORY",
    recordType: "ILLNESS",
    typicalSeverity: "MODERATE",
    signs: ["Laboured or rapid breathing", "Thumping", "Fever", "Reduced feed intake", "Huddling"],
    treatments: ["Antibiotic course per veterinary advice", "Anti-inflammatory", "Improve ventilation, reduce dust", "Isolate affected animals"],
    antibioticLikely: true,
    contagious: true,
    aliases: ["enzootic pneumonia", "mycoplasma pneumonia"],
  },
  {
    diagnosis: "Pleurisy",
    category: "RESPIRATORY",
    recordType: "ILLNESS",
    typicalSeverity: "SEVERE",
    signs: ["Painful shallow breathing", "Reluctance to move", "Fever", "Sudden death in acute cases"],
    treatments: ["Antibiotic course per veterinary advice", "Anti-inflammatory", "Isolate affected animals"],
    antibioticLikely: true,
    contagious: true,
    aliases: ["pleuropneumonia", "app"],
  },
  {
    diagnosis: "Coughing",
    category: "RESPIRATORY",
    recordType: "ILLNESS",
    typicalSeverity: "MILD",
    signs: ["Dry or productive cough", "Cough on movement", "Otherwise bright"],
    treatments: ["Monitor and re-examine in 48 hours", "Reduce dust and ammonia", "Check ventilation and stocking density"],
    antibioticLikely: false,
    contagious: true,
    aliases: ["cough"],
  },
  {
    diagnosis: "Atrophic rhinitis",
    category: "RESPIRATORY",
    recordType: "ILLNESS",
    typicalSeverity: "MODERATE",
    signs: ["Sneezing", "Nasal discharge", "Twisted or shortened snout", "Tear staining"],
    treatments: ["Antibiotic course per veterinary advice", "Review sow vaccination programme"],
    antibioticLikely: true,
    contagious: true,
    aliases: ["rhinitis"],
  },

  // --- Digestive ----------------------------------------------------------
  {
    diagnosis: "Scours (diarrhoea)",
    category: "DIGESTIVE",
    recordType: "ILLNESS",
    typicalSeverity: "MODERATE",
    signs: ["Loose or watery faeces", "Soiled hindquarters", "Dehydration", "Poor growth", "Sunken eyes"],
    treatments: ["Oral rehydration / electrolytes", "Antibiotic course per veterinary advice", "Clean and disinfect pen", "Review creep feed and water hygiene"],
    antibioticLikely: true,
    contagious: true,
    aliases: ["scours", "diarrhoea", "diarrhea", "scour"],
  },
  {
    diagnosis: "Ileitis",
    category: "DIGESTIVE",
    recordType: "ILLNESS",
    typicalSeverity: "MODERATE",
    signs: ["Loose dark faeces", "Sudden weight loss", "Pallor", "Sudden death in acute form"],
    treatments: ["Antibiotic course per veterinary advice", "In-feed medication for the group", "Review stress and mixing events"],
    antibioticLikely: true,
    contagious: true,
    aliases: ["porcine proliferative enteropathy", "ppe"],
  },
  {
    diagnosis: "Constipation",
    category: "DIGESTIVE",
    recordType: "ILLNESS",
    typicalSeverity: "MILD",
    signs: ["Hard dry faeces", "Straining", "Reduced appetite", "Common in sows around farrowing"],
    treatments: ["Increase water access", "Add fibre or bran to ration", "Encourage movement"],
    antibioticLikely: false,
    contagious: false,
  },
  {
    diagnosis: "Gastric ulcer",
    category: "DIGESTIVE",
    recordType: "ILLNESS",
    typicalSeverity: "SEVERE",
    signs: ["Pallor", "Black tarry faeces", "Sudden death", "Grinding teeth"],
    treatments: ["Coarsen feed grind", "Ensure uninterrupted feed supply", "Veterinary examination"],
    antibioticLikely: false,
    contagious: false,
  },

  // --- Musculoskeletal ----------------------------------------------------
  {
    diagnosis: "Lameness",
    category: "MUSCULOSKELETAL",
    recordType: "ILLNESS",
    typicalSeverity: "MODERATE",
    signs: ["Limping", "Reluctance to bear weight", "Swollen joint", "Reduced feed intake"],
    treatments: ["Anti-inflammatory", "Move to a bedded recovery pen", "Check floor surface and slat condition", "Foot trim if overgrown"],
    antibioticLikely: false,
    contagious: false,
    aliases: ["lame"],
  },
  {
    diagnosis: "Fracture",
    category: "MUSCULOSKELETAL",
    recordType: "INJURY",
    typicalSeverity: "SEVERE",
    signs: ["Non-weight-bearing limb", "Abnormal angle or swelling", "Severe pain response"],
    treatments: ["Immediate veterinary assessment", "Analgesia", "Consider euthanasia on welfare grounds"],
    antibioticLikely: false,
    contagious: false,
    aliases: ["broken leg"],
  },
  {
    diagnosis: "Arthritis (joint ill)",
    category: "MUSCULOSKELETAL",
    recordType: "ILLNESS",
    typicalSeverity: "MODERATE",
    signs: ["Hot swollen joints", "Stiff gait", "Fever", "Common after navel or tail infection"],
    treatments: ["Antibiotic course per veterinary advice", "Anti-inflammatory", "Improve navel hygiene at birth"],
    antibioticLikely: true,
    contagious: false,
    aliases: ["joint ill", "arthritis"],
  },

  // --- Skin / external ----------------------------------------------------
  {
    diagnosis: "Mange",
    category: "SKIN",
    recordType: "ILLNESS",
    typicalSeverity: "MODERATE",
    signs: ["Intense rubbing and scratching", "Crusty ears", "Thickened wrinkled skin", "Poor growth"],
    treatments: ["Whole-group parasiticide treatment", "Treat all in-contact animals", "Clean and disinfect housing"],
    antibioticLikely: false,
    contagious: true,
    aliases: ["sarcoptic mange", "scabies"],
  },
  {
    diagnosis: "Abscess",
    category: "SKIN",
    recordType: "ILLNESS",
    typicalSeverity: "MODERATE",
    signs: ["Localised firm or fluctuant swelling", "Heat and pain", "May discharge pus"],
    treatments: ["Lance and flush once pointing", "Antibiotic course per veterinary advice", "Review injection hygiene"],
    antibioticLikely: true,
    contagious: false,
  },
  {
    diagnosis: "Wound / laceration",
    category: "SKIN",
    recordType: "INJURY",
    typicalSeverity: "MILD",
    signs: ["Open skin wound", "Bleeding", "Swelling around the site"],
    treatments: ["Clean and disinfect", "Topical antiseptic", "Isolate if being targeted by pen mates", "Check pen for sharp edges"],
    antibioticLikely: false,
    contagious: false,
    aliases: ["wound", "laceration", "cut"],
  },
  {
    diagnosis: "Greasy animal disease",
    category: "SKIN",
    recordType: "ILLNESS",
    typicalSeverity: "MODERATE",
    signs: ["Greasy brown skin exudate", "Spreading dark patches", "Depression", "Dehydration in offspring"],
    treatments: ["Antibiotic course per veterinary advice", "Topical antiseptic wash", "Clip needle teeth, reduce fighting"],
    antibioticLikely: true,
    contagious: true,
    aliases: ["exudative epidermitis"],
  },

  // --- Parasitic ----------------------------------------------------------
  {
    diagnosis: "Roundworm",
    category: "PARASITIC",
    recordType: "ILLNESS",
    typicalSeverity: "MILD",
    signs: ["Poor growth despite good intake", "Rough coat", "Coughing from larval migration", "Worms visible in faeces"],
    treatments: ["Anthelmintic for the whole group", "Clean and disinfect pens", "Review the worming schedule"],
    antibioticLikely: false,
    contagious: true,
    aliases: ["ascaris", "worms", "roundworms"],
  },
  {
    diagnosis: "Lice",
    category: "PARASITIC",
    recordType: "ILLNESS",
    typicalSeverity: "MILD",
    signs: ["Rubbing", "Visible lice or eggs around ears and flanks", "Restlessness", "Anaemia in heavy burdens"],
    treatments: ["Parasiticide to all in-contact animals", "Treat housing", "Repeat after the egg-hatch interval"],
    antibioticLikely: false,
    contagious: true,
  },
  {
    diagnosis: "Coccidiosis",
    category: "PARASITIC",
    recordType: "ILLNESS",
    typicalSeverity: "MODERATE",
    signs: ["Pasty yellow scour in offspring 7-14 days old", "Poor growth", "Unresponsive to antibiotics"],
    treatments: ["Anticoccidial per veterinary advice", "Steam clean farrowing crates between batches", "Improve bedding hygiene"],
    antibioticLikely: false,
    contagious: true,
  },

  // --- Metabolic ----------------------------------------------------------
  {
    diagnosis: "Anaemia",
    category: "METABOLIC",
    recordType: "ILLNESS",
    typicalSeverity: "MODERATE",
    signs: ["Pale skin and mucous membranes", "Lethargy", "Poor growth", "Laboured breathing on exertion"],
    treatments: ["Iron injection", "Check the routine offspring iron protocol", "Rule out ulcer or heavy parasite burden"],
    antibioticLikely: false,
    contagious: false,
    aliases: ["anemia"],
  },
  {
    diagnosis: "Dehydration",
    category: "METABOLIC",
    recordType: "ILLNESS",
    typicalSeverity: "MODERATE",
    signs: ["Sunken eyes", "Skin tenting", "Reduced urination", "Lethargy"],
    treatments: ["Oral or parenteral rehydration", "Check drinker flow rate and height", "Treat the underlying cause"],
    antibioticLikely: false,
    contagious: false,
  },
  {
    diagnosis: "Heat stress",
    category: "METABOLIC",
    recordType: "ILLNESS",
    typicalSeverity: "MODERATE",
    signs: ["Panting", "Lying apart on cool surfaces", "Reduced feed intake", "Sudden death in heavy animals"],
    treatments: ["Wet the animals and increase airflow", "Ensure abundant cool water", "Reduce stocking density", "Feed in the cool of the day"],
    antibioticLikely: false,
    contagious: false,
  },

  // --- Reproductive -------------------------------------------------------
  {
    diagnosis: "Mastitis",
    category: "REPRODUCTIVE",
    recordType: "ILLNESS",
    typicalSeverity: "SEVERE",
    signs: ["Hard hot painful udder", "Fever", "Sow off feed", "Offspring hungry and squealing"],
    treatments: ["Antibiotic course per veterinary advice", "Anti-inflammatory", "Strip affected glands", "Supplement the litter"],
    antibioticLikely: true,
    contagious: false,
  },
  {
    diagnosis: "Metritis",
    category: "REPRODUCTIVE",
    recordType: "ILLNESS",
    typicalSeverity: "SEVERE",
    signs: ["Purulent vulval discharge", "Fever", "Off feed after farrowing", "Reduced milk"],
    treatments: ["Antibiotic course per veterinary advice", "Review farrowing hygiene and assistance technique"],
    antibioticLikely: true,
    contagious: false,
  },
  {
    diagnosis: "Agalactia",
    category: "REPRODUCTIVE",
    recordType: "ILLNESS",
    typicalSeverity: "SEVERE",
    signs: ["No or little milk let-down", "Restless hungry litter", "Sow constipated and off feed"],
    treatments: ["Veterinary treatment for the MMA complex", "Oxytocin per veterinary advice", "Cross-foster or supplement the litter"],
    antibioticLikely: true,
    contagious: false,
    aliases: ["mma"],
  },
  {
    diagnosis: "Abortion",
    category: "REPRODUCTIVE",
    recordType: "ILLNESS",
    typicalSeverity: "SEVERE",
    signs: ["Foetuses expelled before term", "Bloody or brown discharge", "Sow may be otherwise well"],
    treatments: ["Isolate and submit material for diagnosis", "Review vaccination and biosecurity", "Record against the breeding record"],
    antibioticLikely: false,
    contagious: true,
    aliases: ["miscarriage"],
  },
  {
    diagnosis: "Retained placenta",
    category: "REPRODUCTIVE",
    recordType: "ILLNESS",
    typicalSeverity: "MODERATE",
    signs: ["Membranes not passed within 4-6 hours of farrowing", "Straining", "Later discharge and fever"],
    treatments: ["Veterinary examination", "Antibiotic cover per veterinary advice", "Monitor for metritis"],
    antibioticLikely: true,
    contagious: false,
  },
  {
    diagnosis: "Stillbirth",
    category: "REPRODUCTIVE",
    recordType: "EXAM",
    typicalSeverity: "MODERATE",
    signs: ["Offspring born dead", "Meconium staining", "Prolonged farrowing"],
    treatments: ["Review farrowing supervision", "Check sow body condition and gestation feeding", "Submit for diagnosis if clustered"],
    antibioticLikely: false,
    contagious: false,
  },

  // --- Behavioural --------------------------------------------------------
  {
    diagnosis: "Tail biting",
    category: "BEHAVIORAL",
    recordType: "INJURY",
    typicalSeverity: "MODERATE",
    signs: ["Blood on tails", "Chewed or shortened tails", "Restless pen", "Pigs following one another"],
    treatments: ["Remove biter and bitten to separate pens", "Provide enrichment material", "Check stocking density, ventilation and feed access", "Treat wounds"],
    antibioticLikely: false,
    contagious: false,
    aliases: ["tail-biting"],
  },
  {
    diagnosis: "Aggression",
    category: "BEHAVIORAL",
    recordType: "INJURY",
    typicalSeverity: "MILD",
    signs: ["Fighting at mixing", "Shoulder and flank scratches", "Bullying at the feeder"],
    treatments: ["Separate the persistent aggressor", "Increase feeder space", "Mix at night or with enrichment", "Treat wounds"],
    antibioticLikely: false,
    contagious: false,
  },
  {
    diagnosis: "Lethargy",
    category: "BEHAVIORAL",
    recordType: "EXAM",
    typicalSeverity: "MILD",
    signs: ["Reluctant to rise", "Separated from the group", "Dull demeanour", "Reduced feed intake"],
    treatments: ["Full clinical examination", "Take temperature", "Move to a hospital pen and monitor"],
    antibioticLikely: false,
    contagious: false,
    aliases: ["dullness", "off feed"],
  },

  // --- Other --------------------------------------------------------------
  {
    diagnosis: "Sudden death (undiagnosed)",
    category: "OTHER",
    recordType: "EXAM",
    typicalSeverity: "SEVERE",
    signs: ["Found dead with no prior signs"],
    treatments: ["Post-mortem examination", "Check the rest of the group", "Review feed and water supply"],
    antibioticLikely: false,
    contagious: false,
  },
  {
    diagnosis: "Routine health check",
    category: "OTHER",
    recordType: "EXAM",
    typicalSeverity: "MILD",
    signs: [],
    treatments: [],
    antibioticLikely: false,
    contagious: false,
  },
];

/** Grouped for the picker, in enum declaration order. */
export const CONDITIONS_BY_CATEGORY: Record<HealthCategory, Condition[]> = CONDITIONS.reduce(
  (acc, condition) => {
    (acc[condition.category] ??= []).push(condition);
    return acc;
  },
  {} as Record<HealthCategory, Condition[]>
);

/** Canonical diagnosis strings, for a `<datalist>` and for filter dropdowns. */
export const CONDITION_DIAGNOSES: readonly string[] = CONDITIONS.map((c) => c.diagnosis);

function key(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

const BY_KEY = new Map<string, Condition>();
for (const condition of CONDITIONS) {
  BY_KEY.set(key(condition.diagnosis), condition);
  for (const alias of condition.aliases ?? []) {
    if (!BY_KEY.has(key(alias))) BY_KEY.set(key(alias), condition);
  }
}

/** Looks a diagnosis up by canonical name or alias, case-insensitively. */
export function findCondition(diagnosis: string | null | undefined): Condition | undefined {
  if (!diagnosis) return undefined;
  return BY_KEY.get(key(diagnosis));
}

/**
 * Collapses a typed diagnosis onto its canonical spelling when it is one this
 * list knows (including by alias), so the outbreak detector clusters
 * "diarrhoea" and "Scours" together. Unknown text is kept, only trimmed and
 * whitespace-collapsed — the farm may genuinely be recording something new.
 */
export function normaliseDiagnosis(input: string): string {
  const trimmed = input.trim().replace(/\s+/g, " ");
  return findCondition(trimmed)?.diagnosis ?? trimmed;
}

/** True when this diagnosis spreads animal to animal (drives isolation advice). */
export function isContagious(diagnosis: string): boolean {
  return findCondition(diagnosis)?.contagious ?? false;
}

/** Diagnoses that count towards a reproductive-failure cluster (§3.2). */
export const REPRODUCTIVE_FAILURE_DIAGNOSES: readonly string[] = [
  "Abortion",
  "Stillbirth",
  "Metritis",
  "Mastitis",
  "Agalactia",
  "Retained placenta",
];
