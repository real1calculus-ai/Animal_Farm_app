/**
 * Demo herd seed.
 *
 * Idempotent by design: it keys everything to one farm and bails out if that
 * farm already has animals, so re-running it after a migration can never
 * duplicate a herd or overwrite real records. Pass RESEED=1 to wipe the demo
 * farm's data and rebuild it.
 *
 * The pedigree here is not decorative. It is built three generations deep with
 * a deliberate half-sibling pair and one line that shares a founder, because a
 * flat list of unrelated animals would let the breeding match finder score
 * everything at 100 and prove nothing. Dates are relative to the run time, so
 * the calendar, vaccination schedule and alert screens always have something
 * current to show.
 */

import { PrismaClient, type HousingType, type Prisma, type Sex } from "@prisma/client";

import { SPECIES_CATALOGUE } from "../src/lib/species-catalogue";

const prisma = new PrismaClient();

const FARM_NAME = "Green Pastures Farm";
const DAY = 86_400_000;

const now = new Date();
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY);
const daysAhead = (days: number) => new Date(now.getTime() + days * DAY);

/** Naira, in kobo — matches the app's integer-minor-unit convention. */
const naira = (amount: number) => Math.round(amount * 100);

async function main() {
  const farm = await prisma.farm.upsert({
    where: { name: FARM_NAME },
    update: {},
    create: { name: FARM_NAME, location: "Ogun State" },
  });

  await prisma.farmSettings.upsert({
    where: { farmId: farm.id },
    update: {},
    create: { farmId: farm.id },
  });

  const existingAnimals = await prisma.animal.count({ where: { farmId: farm.id } });

  if (existingAnimals > 0 && process.env.RESEED !== "1") {
    console.log(
      `"${FARM_NAME}" already has ${existingAnimals} animals — nothing to do. Run with RESEED=1 to rebuild the demo data.`
    );
    return;
  }

  if (existingAnimals > 0) {
    console.log("RESEED=1 — clearing the demo farm's data...");
    await clearFarm(farm.id);
  }

  const settings = await prisma.farmSettings.findUniqueOrThrow({ where: { farmId: farm.id } });

  // Species carry the biology every projected date depends on, so they have to
  // exist before a single animal does.
  await prisma.species.createMany({
    data: SPECIES_CATALOGUE.map((entry) => ({ ...entry, farmId: farm.id })),
    skipDuplicates: true,
  });
  const speciesRows = await prisma.species.findMany({ where: { farmId: farm.id } });
  const species = new Map(speciesRows.map((row) => [row.code, row]));
  const pigSpeciesId = species.get("PIG")!.id;

  // --- Housing ----------------------------------------------------------
  const pens = await createPens(farm.id);

  // --- Founders ---------------------------------------------------------
  // Generation 0: purchased stock with no recorded parents. Their inbreeding
  // coefficient is 0 by definition, which is what makes them founders.
  const founders = await Promise.all([
    createAnimal(farm.id, { tag: "B-001", speciesId: pigSpeciesId, name: "Kano", breed: "Duroc", sex: "MALE", ageDays: 1100, penId: pens.boar.id, weightKg: 265, bcs: 3 }),
    createAnimal(farm.id, { tag: "B-002", speciesId: pigSpeciesId, name: "Zaria", breed: "Large White", sex: "MALE", ageDays: 980, penId: pens.boar.id, weightKg: 248, bcs: 3 }),
    createAnimal(farm.id, { tag: "B-003", speciesId: pigSpeciesId, name: "Oyo", breed: "Pietrain", sex: "MALE", ageDays: 860, penId: pens.boar.id, weightKg: 232, bcs: 4 }),
    createAnimal(farm.id, { tag: "S-001", speciesId: pigSpeciesId, name: "Ada", breed: "Landrace", sex: "FEMALE", ageDays: 1180, penId: pens.gestation.id, weightKg: 212, bcs: 3 }),
    createAnimal(farm.id, { tag: "S-002", speciesId: pigSpeciesId, name: "Ngozi", breed: "Duroc", sex: "FEMALE", ageDays: 1050, penId: pens.gestation.id, weightKg: 198, bcs: 3 }),
    createAnimal(farm.id, { tag: "S-003", speciesId: pigSpeciesId, name: "Amina", breed: "Large White", sex: "FEMALE", ageDays: 990, penId: pens.gestation.id, weightKg: 205, bcs: 2 }),
    createAnimal(farm.id, { tag: "S-004", speciesId: pigSpeciesId, name: "Chidi", breed: "Landrace", sex: "FEMALE", ageDays: 930, penId: pens.gestation.id, weightKg: 189, bcs: 3 }),
    createAnimal(farm.id, { tag: "S-005", speciesId: pigSpeciesId, name: "Bisi", breed: "Berkshire", sex: "FEMALE", ageDays: 870, penId: pens.gestation.id, weightKg: 194, bcs: 3 }),
  ]);

  const [kano, zaria, oyo, ada, ngozi, amina, chidi] = founders;

  // --- Generation 1 -----------------------------------------------------
  // Kano sires two litters by different dams. Their offspring are paternal
  // half-siblings, which is exactly the pairing the match finder should warn
  // about rather than silently allow.
  const litterA = await breedAndFarrow(farm.id, settings.gestationDays, {
    speciesId: pigSpeciesId,
    sire: kano,
    dam: ada,
    bredDaysAgo: 620,
    bornAlive: 9,
    stillborn: 1,
    penId: pens.grower.id,
    tagPrefix: "G1A",
    offspring: [
      { sex: "MALE", breed: "Duroc" },
      { sex: "FEMALE", breed: "Duroc" },
      { sex: "FEMALE", breed: "Duroc" },
    ],
  });

  const litterB = await breedAndFarrow(farm.id, settings.gestationDays, {
    speciesId: pigSpeciesId,
    sire: kano,
    dam: ngozi,
    bredDaysAgo: 560,
    bornAlive: 11,
    stillborn: 0,
    penId: pens.grower.id,
    tagPrefix: "G1B",
    offspring: [
      { sex: "MALE", breed: "Duroc" },
      { sex: "FEMALE", breed: "Duroc" },
    ],
  });

  const litterC = await breedAndFarrow(farm.id, settings.gestationDays, {
    speciesId: pigSpeciesId,
    sire: zaria,
    dam: amina,
    bredDaysAgo: 540,
    bornAlive: 10,
    stillborn: 1,
    penId: pens.finisher.id,
    tagPrefix: "G1C",
    offspring: [
      { sex: "MALE", breed: "Large White" },
      { sex: "FEMALE", breed: "Large White" },
    ],
  });

  // --- Generation 2 -----------------------------------------------------
  // An unrelated pairing: Zaria's line crossed onto Kano's. This is the mating
  // the finder should rank highest, and it gives generation-2 animals so the
  // pedigree tree has real depth to draw.
  await breedAndFarrow(farm.id, settings.gestationDays, {
    speciesId: pigSpeciesId,
    sire: litterC[0],
    dam: litterA[1],
    bredDaysAgo: 200,
    bornAlive: 8,
    stillborn: 0,
    penId: pens.nursery.id,
    tagPrefix: "G2A",
    offspring: [
      { sex: "MALE", breed: "Crossbred" },
      { sex: "FEMALE", breed: "Crossbred" },
      { sex: "FEMALE", breed: "Crossbred" },
    ],
  });

  // --- Live pregnancies, so the calendar has something in it ------------
  await prisma.breedingRecord.create({
    data: {
      farmId: farm.id,
      damId: chidi.id,
      sireId: oyo.id,
      breedingDate: daysAgo(96),
      method: "NATURAL",
      expectedFarrowingDate: daysAgo(96 - settings.gestationDays),
      pregnancyStatus: "CONFIRMED",
      confirmationMethod: "ULTRASOUND",
      confirmationDate: daysAgo(70),
      expectedOffspringCount: 10,
    },
  });

  // Bred a fortnight ago and not yet confirmed — the state the dashboard
  // nudges someone to go and check.
  await prisma.breedingRecord.create({
    data: {
      farmId: farm.id,
      damId: litterB[1].id,
      sireId: oyo.id,
      breedingDate: daysAgo(14),
      method: "ARTIFICIAL_INSEMINATION",
      expectedFarrowingDate: daysAhead(settings.gestationDays - 14),
      pregnancyStatus: "PENDING",
    },
  });

  await prisma.estrusRecord.create({
    data: {
      sowId: litterA[2].id,
      observedAt: daysAgo(3),
      signRestlessness: true,
      signSwollenVulva: true,
      signReceptive: true,
      durationHours: 48,
      wasBred: false,
      notes: "Standing heat observed at morning feed.",
    },
  });

  await seedOtherSpecies(farm.id, species);

  await seedWeights(farm.id);
  await seedHealth(farm.id, [litterA[0], litterC[1], ngozi]);
  await seedFeed(farm.id, pens.grower.id, pens.finisher.id);
  await seedEquipment(farm.id);
  await seedOverheads(farm.id);

  const total = await prisma.animal.count({ where: { farmId: farm.id } });
  const batches = await prisma.animalBatch.count({ where: { farmId: farm.id } });
  console.log(
    `Seeded "${FARM_NAME}": ${total} individually-tracked animals and ${batches} batches, across ${speciesRows.length} species.`
  );
  console.log("Sign up in the app — the first account becomes this farm's administrator.");
}

/**
 * Clears the demo farm's records. Ordered child-first: most relations cascade,
 * but pens are only nulled from Animal, so animals must go before pens do.
 */
async function clearFarm(farmId: string) {
  await prisma.feedingRecord.deleteMany({ where: { farmId } });
  await prisma.feedBatch.deleteMany({ where: { feedType: { farmId } } });
  await prisma.feedingProgram.deleteMany({ where: { farmId } });
  await prisma.feedType.deleteMany({ where: { farmId } });
  await prisma.feedStorageLocation.deleteMany({ where: { farmId } });
  await prisma.supplier.deleteMany({ where: { farmId } });
  await prisma.financialTransaction.deleteMany({ where: { farmId } });
  await prisma.animalSale.deleteMany({ where: { farmId } });
  await prisma.maintenanceRecord.deleteMany({ where: { equipment: { farmId } } });
  await prisma.equipment.deleteMany({ where: { farmId } });
  await prisma.healthRecord.deleteMany({ where: { farmId } });
  await prisma.vaccinationRecord.deleteMany({ where: { animal: { farmId } } });
  await prisma.vaccinationProtocolItem.deleteMany({ where: { farmId } });
  await prisma.breedingRecord.deleteMany({ where: { farmId } });
  await prisma.animal.deleteMany({ where: { farmId } });
  await prisma.pen.deleteMany({ where: { farmId } });
  await prisma.alertAcknowledgement.deleteMany({ where: { farmId } });
}

async function createPens(farmId: string) {
  const spec = [
    { key: "boar", name: "Boar pen", housingType: "BREEDING_MALE", capacity: 4 },
    { key: "gestation", name: "Gestation 1", housingType: "GESTATION", capacity: 12 },
    { key: "farrowing", name: "Farrowing 1", housingType: "FARROWING", capacity: 6 },
    { key: "nursery", name: "Nursery 1", housingType: "NURSERY", capacity: 30 },
    { key: "grower", name: "Grower 1", housingType: "GROWER", capacity: 25 },
    { key: "finisher", name: "Finisher 1", housingType: "FINISHER", capacity: 25 },
    { key: "isolation", name: "Isolation", housingType: "ISOLATION", capacity: 6 },
  ] as const;

  const created: Record<string, { id: string; name: string }> = {};

  for (const pen of spec) {
    const row = await prisma.pen.upsert({
      where: { farmId_name: { farmId, name: pen.name } },
      update: {},
      create: {
        farmId,
        name: pen.name,
        housingType: pen.housingType,
        capacity: pen.capacity,
      },
      select: { id: true, name: true },
    });
    created[pen.key] = row;

    // Cleaning history, so the biosecurity screen is not blank. The isolation
    // pen is left uncleaned on purpose — it is what raises the overdue alert.
    if (pen.key !== "isolation") {
      await prisma.penTask.create({
        data: {
          penId: row.id,
          taskType: "CLEANING",
          performedAt: daysAgo(12),
          nextDueAt: daysAhead(18),
          costCents: naira(3_500),
          notes: "Pressure washed and disinfected.",
        },
      });
    }
  }

  return created as {
    boar: { id: string; name: string };
    gestation: { id: string; name: string };
    farrowing: { id: string; name: string };
    nursery: { id: string; name: string };
    grower: { id: string; name: string };
    finisher: { id: string; name: string };
    isolation: { id: string; name: string };
  };
}

type AnimalSeed = {
  tag: string;
  name?: string;
  breed: string;
  sex: Sex;
  ageDays: number;
  penId?: string;
  weightKg?: number;
  bcs?: number;
  motherId?: string;
  fatherId?: string;
  generation?: number;
  litterId?: string;
  birthWeightKg?: number;
  purchased?: boolean;
  speciesId: string;
};

async function createAnimal(farmId: string, seed: AnimalSeed) {
  const dateOfBirth = daysAgo(seed.ageDays);

  return prisma.animal.upsert({
    where: { farmId_tagNumber: { farmId, tagNumber: seed.tag } },
    update: {},
    create: {
      farmId,
      speciesId: seed.speciesId,
      tagNumber: seed.tag,
      name: seed.name ?? null,
      breed: seed.breed,
      sex: seed.sex,
      dateOfBirth,
      status: "ACTIVE",
      penId: seed.penId ?? null,
      dateMovedIn: seed.penId ? daysAgo(Math.max(1, seed.ageDays - 30)) : null,
      currentWeightKg: seed.weightKg ?? null,
      bodyConditionScore: seed.bcs ?? null,
      motherId: seed.motherId ?? null,
      fatherId: seed.fatherId ?? null,
      generation: seed.generation ?? 0,
      // Founders are unrelated by definition; bred animals get their real
      // coefficient from the engine when the app recomputes on first edit.
      inbreedingCoefficient: seed.motherId && seed.fatherId ? null : 0,
      litterId: seed.litterId ?? null,
      birthWeightKg: seed.birthWeightKg ?? null,
      acquisitionType: seed.purchased ?? !seed.motherId ? "PURCHASED" : "BORN_ON_FARM",
      dateAcquired: dateOfBirth,
      acquisitionCostCents: seed.motherId ? null : naira(180_000),
    },
  });
}

type AnimalRow = Prisma.AnimalGetPayload<object>;

/**
 * Records a mating that reached term, its litter, and the offspring it produced —
 * the same shape the app's farrowing flow writes, so seeded animals are
 * indistinguishable from ones entered by hand.
 */
async function breedAndFarrow(
  farmId: string,
  gestationDays: number,
  spec: {
    sire: AnimalRow;
    dam: AnimalRow;
    bredDaysAgo: number;
    bornAlive: number;
    stillborn: number;
    penId: string;
    tagPrefix: string;
    speciesId: string;
    offspring: { sex: Sex; breed: string }[];
  }
): Promise<AnimalRow[]> {
  const breedingDate = daysAgo(spec.bredDaysAgo);
  const farrowingDate = daysAgo(spec.bredDaysAgo - gestationDays);

  const record = await prisma.breedingRecord.create({
    data: {
      farmId,
      damId: spec.dam.id,
      sireId: spec.sire.id,
      breedingDate,
      method: "NATURAL",
      expectedFarrowingDate: farrowingDate,
      pregnancyStatus: "FARROWED",
      confirmationMethod: "ULTRASOUND",
      confirmationDate: daysAgo(spec.bredDaysAgo - 28),
      offspringInbreedingCoefficient: 0,
    },
  });

  const litter = await prisma.litter.create({
    data: {
      breedingRecordId: record.id,
      farrowingDate,
      bornAlive: spec.bornAlive,
      stillborn: spec.stillborn,
      mummified: 0,
      colostrumIntakeObserved: true,
      weaningDate: new Date(farrowingDate.getTime() + 28 * DAY),
      weanedCount: Math.max(0, spec.bornAlive - 1),
    },
  });

  const ageDays = Math.max(1, spec.bredDaysAgo - gestationDays);
  const generation = Math.max(spec.sire.generation, spec.dam.generation) + 1;

  const created: AnimalRow[] = [];
  for (const [index, young] of spec.offspring.entries()) {
    created.push(
      await createAnimal(farmId, {
        speciesId: spec.speciesId,
        tag: `${spec.tagPrefix}-${String(index + 1).padStart(2, "0")}`,
        breed: young.breed,
        sex: young.sex,
        ageDays,
        penId: spec.penId,
        // Rough liveweight for age, so growth charts and the finisher list are
        // plausible rather than uniform.
        weightKg: Math.round(Math.min(120, ageDays * 0.55) * 10) / 10,
        bcs: 3,
        motherId: spec.dam.id,
        fatherId: spec.sire.id,
        generation,
        litterId: litter.id,
        birthWeightKg: 1.3 + (index % 3) * 0.15,
      })
    );
  }

  return created;
}

/** A short weigh-in history per animal, so ADG and growth curves have slope. */
async function seedWeights(farmId: string) {
  const animals = await prisma.animal.findMany({
    where: { farmId, currentWeightKg: { not: null } },
    select: { id: true, currentWeightKg: true, dateOfBirth: true },
  });

  for (const animal of animals) {
    const current = animal.currentWeightKg ?? 0;
    for (const [index, offsetDays] of [60, 30, 0].entries()) {
      // Walk backwards from the current weight rather than forwards from birth:
      // the latest reading must match Animal.currentWeightKg exactly, or the
      // record page and the herd list disagree on the same animal.
      const weightKg = Math.max(1, Math.round((current - (2 - index) * current * 0.12) * 10) / 10);
      await prisma.weightRecord.create({
        data: {
          animalId: animal.id,
          recordedAt: daysAgo(offsetDays),
          weightKg,
          bodyConditionScore: 3,
        },
      });
    }
  }
}

async function seedHealth(farmId: string, subjects: AnimalRow[]) {
  const [sick, treated, sow] = subjects;

  await prisma.vaccinationProtocolItem.createMany({
    data: [
      { farmId, name: "Offspring iron + Mycoplasma", vaccineName: "Mycoplasma hyopneumoniae", targetStage: "YOUNG", ageDaysMin: 14, ageDaysMax: 21 },
      { farmId, name: "Weaner PRRS", vaccineName: "PRRS", targetStage: "WEANER", ageDaysMin: 42, ageDaysMax: 56 },
      { farmId, name: "Grower booster", vaccineName: "Circovirus", targetStage: "GROWER", ageDaysMin: 70, ageDaysMax: 84 },
      { farmId, name: "Sow annual parvo", vaccineName: "Parvovirus", targetStage: "BREEDING_FEMALE", boosterIntervalDays: 365 },
    ],
    skipDuplicates: true,
  });

  await prisma.vaccinationRecord.create({
    data: {
      animalId: sow.id,
      vaccineName: "Parvovirus",
      administeredAt: daysAgo(300),
      lotNumber: "PV-2415",
      veterinarian: "Dr. Okafor",
      nextDueDate: daysAhead(65),
    },
  });

  // An ongoing case, on antibiotics — this is what puts an animal inside a
  // withdrawal window and makes the sale gate demonstrable.
  const respiratory = await prisma.healthRecord.create({
    data: {
      farmId,
      animalId: sick.id,
      recordedAt: daysAgo(4),
      recordType: "ILLNESS",
      category: "RESPIRATORY",
      severity: "MODERATE",
      diagnosis: "Pneumonia",
      treatment: "Antibiotic course, moved to isolation",
      outcome: "ONGOING",
      costCents: naira(12_000),
    },
  });

  await prisma.medication.create({
    data: {
      healthRecordId: respiratory.id,
      drugName: "Oxytetracycline",
      dosage: "20 mg/kg",
      route: "INJECTION",
      startDate: daysAgo(4),
      durationDays: 5,
      withdrawalDays: 28,
      isAntibiotic: true,
      costCents: naira(4_500),
    },
  });

  const lameness = await prisma.healthRecord.create({
    data: {
      farmId,
      animalId: treated.id,
      recordedAt: daysAgo(40),
      recordType: "INJURY",
      category: "MUSCULOSKELETAL",
      severity: "MILD",
      diagnosis: "Lameness",
      treatment: "Anti-inflammatory, bedding deepened",
      outcome: "RECOVERED",
      resolvedAt: daysAgo(31),
      costCents: naira(6_000),
    },
  });

  await prisma.medication.create({
    data: {
      healthRecordId: lameness.id,
      drugName: "Meloxicam",
      route: "INJECTION",
      startDate: daysAgo(40),
      durationDays: 3,
      completedDate: daysAgo(38),
      withdrawalDays: 5,
      costCents: naira(2_000),
    },
  });

  await prisma.financialTransaction.createMany({
    data: [
      { farmId, occurredAt: daysAgo(4), direction: "EXPENSE", category: "VETERINARY", amountCents: naira(12_000), description: "Pneumonia treatment", healthRecordId: respiratory.id },
      { farmId, occurredAt: daysAgo(40), direction: "EXPENSE", category: "VETERINARY", amountCents: naira(6_000), description: "Lameness treatment", healthRecordId: lameness.id },
    ],
  });
}

async function seedFeed(farmId: string, growerPenId: string, finisherPenId: string) {
  const supplier = await prisma.supplier.upsert({
    where: { farmId_name: { farmId, name: "Ogun Feed Mills" } },
    update: {},
    create: { farmId, name: "Ogun Feed Mills", phone: "0803 000 0000" },
  });

  const store = await prisma.feedStorageLocation.upsert({
    where: { farmId_name: { farmId, name: "Main feed store" } },
    update: {},
    create: { farmId, name: "Main feed store", capacityKg: 5000 },
  });

  const types = [
    { name: "Grower mash", classification: "GROWER" as const, protein: 18, cost: naira(520), reorder: 250 },
    { name: "Finisher mash", classification: "FINISHER" as const, protein: 16, cost: naira(495), reorder: 250 },
    { name: "Sow gestation ration", classification: "GESTATION" as const, protein: 15, cost: naira(540), reorder: 150 },
  ];

  for (const [index, type] of types.entries()) {
    const feedType = await prisma.feedType.upsert({
      where: { farmId_name: { farmId, name: type.name } },
      update: {},
      create: {
        farmId,
        name: type.name,
        classification: type.classification,
        proteinPct: type.protein,
        meKcalPerKg: 3200,
        costPerKgCents: type.cost,
        supplierId: supplier.id,
        reorderLevelKg: type.reorder,
      },
    });

    // Two deliveries each: an older one partly drawn down, and a fresh one.
    // The grower feed is left near its reorder level so the low-stock alert
    // has something real to fire on.
    const quantities = index === 0 ? [400, 300] : [600, 800];

    for (const [batchIndex, quantityKg] of quantities.entries()) {
      const receivedDate = daysAgo(batchIndex === 0 ? 75 : 20);
      const remainingKg = batchIndex === 0 ? Math.round(quantityKg * 0.15) : Math.round(quantityKg * 0.6);

      const batch = await prisma.feedBatch.create({
        data: {
          feedTypeId: feedType.id,
          batchCode: `${type.name.slice(0, 3).toUpperCase()}-${batchIndex + 1}`,
          supplierLotNumber: `LOT-${1000 + index * 10 + batchIndex}`,
          supplierId: supplier.id,
          receivedDate,
          expirationDate: new Date(receivedDate.getTime() + 120 * DAY),
          quantityKg,
          remainingKg,
          costPerKgCents: type.cost,
          storageLocationId: store.id,
        },
      });

      await prisma.financialTransaction.create({
        data: {
          farmId,
          occurredAt: receivedDate,
          direction: "EXPENSE",
          category: "FEED",
          amountCents: quantityKg * type.cost,
          description: `${type.name} delivery — ${quantityKg} kg`,
          feedBatchId: batch.id,
        },
      });

      if (batchIndex === 1) {
        await prisma.feedingProgram.upsert({
          where: { farmId_name: { farmId, name: `${type.name} ration` } },
          update: {},
          create: {
            farmId,
            name: `${type.name} ration`,
            stage: type.classification === "GROWER" ? "GROWER" : type.classification === "FINISHER" ? "FINISHER" : "BREEDING_FEMALE",
            feedTypeId: feedType.id,
            dailyKgPerAnimal: type.classification === "GESTATION" ? 2.5 : 2.0,
          },
        });

        // Fourteen days of pen feeding, so feed conversion and the
        // consumption-drop detector have a series to work with.
        const penId = type.classification === "FINISHER" ? finisherPenId : growerPenId;
        const animalCount = await prisma.animal.count({ where: { penId } });

        if (animalCount > 0) {
          for (let day = 14; day >= 1; day--) {
            const allocatedKg = Math.round(animalCount * 2.0 * 10) / 10;
            await prisma.feedingRecord.create({
              data: {
                farmId,
                fedAt: daysAgo(day),
                penId,
                animalCount,
                feedTypeId: feedType.id,
                feedBatchId: batch.id,
                allocatedKg,
                consumedKg: Math.round(allocatedKg * (0.9 + (day % 3) * 0.03) * 10) / 10,
                costPerKgCents: type.cost,
              },
            });
          }
        }
      }
    }
  }
}

async function seedEquipment(farmId: string) {
  const mixer = await prisma.equipment.create({
    data: {
      farmId,
      name: "Feed mixer",
      category: "Feeding equipment",
      purchaseDate: daysAgo(700),
      purchaseCostCents: naira(950_000),
      expectedLifeMonths: 84,
      status: "IN_SERVICE",
      location: "Feed store",
    },
  });

  await prisma.maintenanceRecord.create({
    data: {
      equipmentId: mixer.id,
      performedAt: daysAgo(45),
      maintenanceType: "PREVENTIVE",
      description: "Belt tensioned, bearings greased",
      costCents: naira(15_000),
      nextDueAt: daysAgo(5),
    },
  });

  await prisma.equipment.create({
    data: {
      farmId,
      name: "Farrowing crate #2",
      category: "Housing equipment",
      purchaseDate: daysAgo(1500),
      purchaseCostCents: naira(320_000),
      expectedLifeMonths: 48,
      status: "NEEDS_REPAIR",
      notes: "Rear gate latch bent.",
    },
  });
}

/** Farm-level overheads, so the profitability page has something to allocate. */
async function seedOverheads(farmId: string) {
  const months = [0, 1, 2];
  for (const month of months) {
    const occurredAt = daysAgo(month * 30 + 5);
    await prisma.financialTransaction.createMany({
      data: [
        { farmId, occurredAt, direction: "EXPENSE", category: "LABOR", amountCents: naira(180_000), description: "Farm hands — monthly wages" },
        { farmId, occurredAt, direction: "EXPENSE", category: "UTILITIES", amountCents: naira(42_000), description: "Water and electricity" },
      ],
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

/**
 * The rest of the farm: goats, rabbits, guard dogs, and the batch-tracked
 * enterprises — broilers, layers, catfish and snails.
 *
 * Deliberately mixed, because the point of the demo is to show that the three
 * tracking modes coexist: a named goat with a pedigree, a rabbit doe whose
 * kits are counted rather than tagged, and a house of 500 birds that is one
 * row with an event log behind it.
 */
async function seedOtherSpecies(farmId: string, species: Map<string, { id: string }>) {
  const penFor = async (name: string, housingType: HousingType, capacity: number) =>
    prisma.pen.upsert({
      where: { farmId_name: { farmId, name } },
      update: {},
      create: { farmId, name, housingType, capacity },
      select: { id: true },
    });

  const [goatHouse, rabbitry, broilerHouse, layerHouse, pond, snailPen, kennel] = await Promise.all([
    penFor("Goat house", "GROWER", 40),
    penFor("Rabbitry", "GROWER", 60),
    penFor("Broiler house 1", "GROWER", 600),
    penFor("Layer house 1", "GROWER", 400),
    penFor("Catfish pond 1", "GROWER", 2000),
    penFor("Snailery 1", "GROWER", 1000),
    penFor("Kennel", "ISOLATION", 4),
  ]);

  // --- Goats: individually tracked, one kidding on record ----------------
  const goatId = species.get("GOA")!.id;

  const [buck, doeA, doeB] = await Promise.all([
    createAnimal(farmId, { speciesId: goatId, tag: "G-001", name: "Sango", breed: "West African Dwarf", sex: "MALE", ageDays: 900, penId: goatHouse.id, weightKg: 38, bcs: 3 }),
    createAnimal(farmId, { speciesId: goatId, tag: "G-002", name: "Yemi", breed: "West African Dwarf", sex: "FEMALE", ageDays: 820, penId: goatHouse.id, weightKg: 31, bcs: 3 }),
    createAnimal(farmId, { speciesId: goatId, tag: "G-003", name: "Titi", breed: "Red Sokoto", sex: "FEMALE", ageDays: 760, penId: goatHouse.id, weightKg: 29, bcs: 2 }),
  ]);

  // Goat gestation is 150 days, not the pig's 114 — the whole reason the
  // figure lives on the species rather than in a constant.
  await breedAndFarrow(farmId, 150, {
    speciesId: goatId,
    sire: buck,
    dam: doeA,
    bredDaysAgo: 300,
    bornAlive: 2,
    stillborn: 0,
    penId: goatHouse.id,
    tagPrefix: "GK1",
    offspring: [
      { sex: "FEMALE", breed: "West African Dwarf" },
      { sex: "MALE", breed: "West African Dwarf" },
    ],
  });

  // An open doe due to be bred — gives the match finder a second species.
  void doeB;

  // --- Rabbits: hybrid. Does named, kits counted ------------------------
  const rabbitId = species.get("RAB")!.id;
  await Promise.all([
    createAnimal(farmId, { speciesId: rabbitId, tag: "R-001", name: "Snow", breed: "New Zealand White", sex: "FEMALE", ageDays: 400, penId: rabbitry.id, weightKg: 4.2, bcs: 3 }),
    createAnimal(farmId, { speciesId: rabbitId, tag: "R-002", name: "Ash", breed: "Chinchilla", sex: "FEMALE", ageDays: 380, penId: rabbitry.id, weightKg: 4.0, bcs: 3 }),
    createAnimal(farmId, { speciesId: rabbitId, tag: "R-003", name: "Bolt", breed: "New Zealand White", sex: "MALE", ageDays: 420, penId: rabbitry.id, weightKg: 4.6, bcs: 3 }),
  ]);

  // --- Guard dogs: working animals, never production --------------------
  const dogId = species.get("DOG")!.id;
  const dogs = await Promise.all([
    createAnimal(farmId, { speciesId: dogId, tag: "D-001", name: "Bingo", breed: "Nigerian local", sex: "MALE", ageDays: 1300, penId: kennel.id, weightKg: 24, bcs: 5 }),
    createAnimal(farmId, { speciesId: dogId, tag: "D-002", name: "Sasha", breed: "German Shepherd", sex: "FEMALE", ageDays: 900, penId: kennel.id, weightKg: 28, bcs: 5 }),
  ]);

  // Rabies is the record that matters for a farm dog — annually, by law in
  // most places, and the one vaccination a working animal cannot skip.
  for (const dog of dogs) {
    await prisma.vaccinationRecord.create({
      data: {
        animalId: dog.id,
        vaccineName: "Rabies",
        administeredAt: daysAgo(200),
        lotNumber: "RAB-8821",
        veterinarian: "Dr. Okafor",
        nextDueDate: daysAhead(165),
      },
    });
  }

  // --- Batch enterprises -------------------------------------------------
  await seedBatch(farmId, {
    speciesId: species.get("BRO")!.id,
    name: "Broilers — August intake",
    batchCode: "BRO-2608",
    penId: broilerHouse.id,
    startDaysAgo: 38,
    initialCount: 500,
    startAgeDays: 0,
    source: "Zartech hatchery",
    unitCostCents: naira(1_100),
    // Broiler mortality is front-loaded: most of the loss is in the first
    // week, and a flat rate across the cycle would hide exactly the problem
    // a farmer needs to catch.
    mortality: [
      { daysAgo: 36, count: 9, reason: "First-week losses — weak chicks" },
      { daysAgo: 30, count: 4, reason: "Culled runts" },
      { daysAgo: 18, count: 3, reason: "Heat stress" },
      { daysAgo: 6, count: 2, reason: "Leg weakness" },
    ],
    weights: [
      { daysAgo: 24, avgKg: 0.75 },
      { daysAgo: 10, avgKg: 1.6 },
      { daysAgo: 2, avgKg: 2.25 },
    ],
  });

  const layers = await seedBatch(farmId, {
    speciesId: species.get("LAY")!.id,
    name: "Layers — point of lay",
    batchCode: "LAY-2603",
    penId: layerHouse.id,
    startDaysAgo: 220,
    initialCount: 300,
    startAgeDays: 112,
    source: "CHI Farms",
    unitCostCents: naira(2_400),
    mortality: [
      { daysAgo: 200, count: 5, reason: "Transport stress" },
      { daysAgo: 90, count: 3, reason: "Prolapse" },
    ],
    weights: [{ daysAgo: 30, avgKg: 1.8 }],
  });

  // Thirty days of egg collection, so lay percentage has a series behind it.
  for (let day = 30; day >= 1; day--) {
    const flock = 292;
    const rate = 0.82 + (day % 5) * 0.01;
    const collected = Math.round(flock * rate);
    await prisma.batchProductionRecord.create({
      data: {
        batchId: layers.id,
        productionType: "EGGS",
        collectedAt: daysAgo(day),
        quantity: collected,
        unit: "eggs",
        // Cracked and dirty eggs count toward lay rate but not toward revenue,
        // which is why they are recorded separately rather than netted off.
        rejectedQuantity: Math.round(collected * 0.03),
      },
    });
  }

  await seedBatch(farmId, {
    speciesId: species.get("CFH")!.id,
    name: "Catfish — pond 1",
    batchCode: "CFH-2605",
    penId: pond.id,
    startDaysAgo: 120,
    initialCount: 1500,
    startAgeDays: 42,
    source: "Local hatchery",
    unitCostCents: naira(80),
    mortality: [
      { daysAgo: 110, count: 60, reason: "Post-stocking adjustment" },
      { daysAgo: 60, count: 25, reason: "Water quality — low dissolved oxygen" },
    ],
    weights: [
      { daysAgo: 60, avgKg: 0.25 },
      { daysAgo: 14, avgKg: 0.62 },
    ],
  });

  await seedBatch(farmId, {
    speciesId: species.get("SNA")!.id,
    name: "Snails — pen 1",
    batchCode: "SNA-2604",
    penId: snailPen.id,
    startDaysAgo: 150,
    initialCount: 800,
    startAgeDays: 60,
    source: "Own stock",
    unitCostCents: naira(120),
    mortality: [{ daysAgo: 120, count: 40, reason: "Dry spell — insufficient misting" }],
    weights: [{ daysAgo: 20, avgKg: 0.09 }],
  });
}

type BatchSeed = {
  speciesId: string;
  name: string;
  batchCode: string;
  penId: string;
  startDaysAgo: number;
  initialCount: number;
  startAgeDays: number;
  source: string;
  unitCostCents: number;
  mortality: { daysAgo: number; count: number; reason: string }[];
  weights: { daysAgo: number; avgKg: number }[];
};

/**
 * Creates a batch with its full event history. `currentCount` is derived from
 * the events rather than typed in, so the cached column and the log agree by
 * construction — which is the invariant the app relies on everywhere else.
 */
async function seedBatch(farmId: string, spec: BatchSeed) {
  const startDate = daysAgo(spec.startDaysAgo);
  const died = spec.mortality.reduce((sum, event) => sum + event.count, 0);
  const currentCount = spec.initialCount - died;
  const latestWeight = spec.weights.at(-1)?.avgKg ?? null;

  const batch = await prisma.animalBatch.upsert({
    where: { farmId_batchCode: { farmId, batchCode: spec.batchCode } },
    update: {},
    create: {
      farmId,
      speciesId: spec.speciesId,
      name: spec.name,
      batchCode: spec.batchCode,
      penId: spec.penId,
      startDate,
      startAgeDays: spec.startAgeDays,
      initialCount: spec.initialCount,
      currentCount,
      source: spec.source,
      acquisitionCostCents: spec.initialCount * spec.unitCostCents,
      avgWeightKg: latestWeight,
    },
    select: { id: true },
  });

  await prisma.batchEvent.create({
    data: {
      batchId: batch.id,
      eventType: "STOCKED",
      occurredAt: startDate,
      quantity: spec.initialCount,
      notes: `Stocked from ${spec.source}`,
    },
  });

  for (const event of spec.mortality) {
    await prisma.batchEvent.create({
      data: {
        batchId: batch.id,
        eventType: "MORTALITY",
        occurredAt: daysAgo(event.daysAgo),
        quantity: event.count,
        reason: event.reason,
      },
    });
  }

  for (const sample of spec.weights) {
    await prisma.batchEvent.create({
      data: {
        batchId: batch.id,
        eventType: "WEIGHT_SAMPLE",
        occurredAt: daysAgo(sample.daysAgo),
        weightKg: sample.avgKg,
      },
    });
  }

  // Stocking is a real cost and belongs in the ledger like any other.
  await prisma.financialTransaction.create({
    data: {
      farmId,
      occurredAt: startDate,
      direction: "EXPENSE",
      category: "OTHER_EXPENSE",
      amountCents: spec.initialCount * spec.unitCostCents,
      description: `${spec.name} — ${spec.initialCount} stocked`,
    },
  });

  return batch;
}
