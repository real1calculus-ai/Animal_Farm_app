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

import { PrismaClient, type Prisma, type Sex } from "@prisma/client";

const prisma = new PrismaClient();

const FARM_NAME = "Green Pastures Piggery";
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

  const existingPigs = await prisma.pig.count({ where: { farmId: farm.id } });

  if (existingPigs > 0 && process.env.RESEED !== "1") {
    console.log(
      `"${FARM_NAME}" already has ${existingPigs} animals — nothing to do. Run with RESEED=1 to rebuild the demo data.`
    );
    return;
  }

  if (existingPigs > 0) {
    console.log("RESEED=1 — clearing the demo farm's data...");
    await clearFarm(farm.id);
  }

  const settings = await prisma.farmSettings.findUniqueOrThrow({ where: { farmId: farm.id } });

  // --- Housing ----------------------------------------------------------
  const pens = await createPens(farm.id);

  // --- Founders ---------------------------------------------------------
  // Generation 0: purchased stock with no recorded parents. Their inbreeding
  // coefficient is 0 by definition, which is what makes them founders.
  const founders = await Promise.all([
    createPig(farm.id, { tag: "B-001", name: "Kano", breed: "Duroc", sex: "MALE", ageDays: 1100, penId: pens.boar.id, weightKg: 265, bcs: 3 }),
    createPig(farm.id, { tag: "B-002", name: "Zaria", breed: "Large White", sex: "MALE", ageDays: 980, penId: pens.boar.id, weightKg: 248, bcs: 3 }),
    createPig(farm.id, { tag: "B-003", name: "Oyo", breed: "Pietrain", sex: "MALE", ageDays: 860, penId: pens.boar.id, weightKg: 232, bcs: 4 }),
    createPig(farm.id, { tag: "S-001", name: "Ada", breed: "Landrace", sex: "FEMALE", ageDays: 1180, penId: pens.gestation.id, weightKg: 212, bcs: 3 }),
    createPig(farm.id, { tag: "S-002", name: "Ngozi", breed: "Duroc", sex: "FEMALE", ageDays: 1050, penId: pens.gestation.id, weightKg: 198, bcs: 3 }),
    createPig(farm.id, { tag: "S-003", name: "Amina", breed: "Large White", sex: "FEMALE", ageDays: 990, penId: pens.gestation.id, weightKg: 205, bcs: 2 }),
    createPig(farm.id, { tag: "S-004", name: "Chidi", breed: "Landrace", sex: "FEMALE", ageDays: 930, penId: pens.gestation.id, weightKg: 189, bcs: 3 }),
    createPig(farm.id, { tag: "S-005", name: "Bisi", breed: "Berkshire", sex: "FEMALE", ageDays: 870, penId: pens.gestation.id, weightKg: 194, bcs: 3 }),
  ]);

  const [kano, zaria, oyo, ada, ngozi, amina, chidi] = founders;

  // --- Generation 1 -----------------------------------------------------
  // Kano sires two litters by different dams. Their offspring are paternal
  // half-siblings, which is exactly the pairing the match finder should warn
  // about rather than silently allow.
  const litterA = await breedAndFarrow(farm.id, settings.gestationDays, {
    sire: kano,
    dam: ada,
    bredDaysAgo: 620,
    bornAlive: 9,
    stillborn: 1,
    penId: pens.grower.id,
    tagPrefix: "G1A",
    piglets: [
      { sex: "MALE", breed: "Duroc" },
      { sex: "FEMALE", breed: "Duroc" },
      { sex: "FEMALE", breed: "Duroc" },
    ],
  });

  const litterB = await breedAndFarrow(farm.id, settings.gestationDays, {
    sire: kano,
    dam: ngozi,
    bredDaysAgo: 560,
    bornAlive: 11,
    stillborn: 0,
    penId: pens.grower.id,
    tagPrefix: "G1B",
    piglets: [
      { sex: "MALE", breed: "Duroc" },
      { sex: "FEMALE", breed: "Duroc" },
    ],
  });

  const litterC = await breedAndFarrow(farm.id, settings.gestationDays, {
    sire: zaria,
    dam: amina,
    bredDaysAgo: 540,
    bornAlive: 10,
    stillborn: 1,
    penId: pens.finisher.id,
    tagPrefix: "G1C",
    piglets: [
      { sex: "MALE", breed: "Large White" },
      { sex: "FEMALE", breed: "Large White" },
    ],
  });

  // --- Generation 2 -----------------------------------------------------
  // An unrelated pairing: Zaria's line crossed onto Kano's. This is the mating
  // the finder should rank highest, and it gives generation-2 animals so the
  // pedigree tree has real depth to draw.
  await breedAndFarrow(farm.id, settings.gestationDays, {
    sire: litterC[0],
    dam: litterA[1],
    bredDaysAgo: 200,
    bornAlive: 8,
    stillborn: 0,
    penId: pens.nursery.id,
    tagPrefix: "G2A",
    piglets: [
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
      expectedPigletCount: 10,
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

  await seedWeights(farm.id);
  await seedHealth(farm.id, [litterA[0], litterC[1], ngozi]);
  await seedFeed(farm.id, pens.grower.id, pens.finisher.id);
  await seedEquipment(farm.id);
  await seedOverheads(farm.id);

  const total = await prisma.pig.count({ where: { farmId: farm.id } });
  console.log(`Seeded "${FARM_NAME}": ${total} animals across ${Object.keys(pens).length} pens.`);
  console.log("Sign up in the app — the first account becomes this farm's administrator.");
}

/**
 * Clears the demo farm's records. Ordered child-first: most relations cascade,
 * but pens are only nulled from Pig, so animals must go before pens do.
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
  await prisma.vaccinationRecord.deleteMany({ where: { pig: { farmId } } });
  await prisma.vaccinationProtocolItem.deleteMany({ where: { farmId } });
  await prisma.breedingRecord.deleteMany({ where: { farmId } });
  await prisma.pig.deleteMany({ where: { farmId } });
  await prisma.pen.deleteMany({ where: { farmId } });
  await prisma.alertAcknowledgement.deleteMany({ where: { farmId } });
}

async function createPens(farmId: string) {
  const spec = [
    { key: "boar", name: "Boar pen", housingType: "BOAR", capacity: 4 },
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

type PigSeed = {
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
};

async function createPig(farmId: string, seed: PigSeed) {
  const dateOfBirth = daysAgo(seed.ageDays);

  return prisma.pig.upsert({
    where: { farmId_tagNumber: { farmId, tagNumber: seed.tag } },
    update: {},
    create: {
      farmId,
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

type PigRow = Prisma.PigGetPayload<object>;

/**
 * Records a mating that reached term, its litter, and the piglets it produced —
 * the same shape the app's farrowing flow writes, so seeded animals are
 * indistinguishable from ones entered by hand.
 */
async function breedAndFarrow(
  farmId: string,
  gestationDays: number,
  spec: {
    sire: PigRow;
    dam: PigRow;
    bredDaysAgo: number;
    bornAlive: number;
    stillborn: number;
    penId: string;
    tagPrefix: string;
    piglets: { sex: Sex; breed: string }[];
  }
): Promise<PigRow[]> {
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

  const piglets: PigRow[] = [];
  for (const [index, piglet] of spec.piglets.entries()) {
    piglets.push(
      await createPig(farmId, {
        tag: `${spec.tagPrefix}-${String(index + 1).padStart(2, "0")}`,
        breed: piglet.breed,
        sex: piglet.sex,
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

  return piglets;
}

/** A short weigh-in history per animal, so ADG and growth curves have slope. */
async function seedWeights(farmId: string) {
  const pigs = await prisma.pig.findMany({
    where: { farmId, currentWeightKg: { not: null } },
    select: { id: true, currentWeightKg: true, dateOfBirth: true },
  });

  for (const pig of pigs) {
    const current = pig.currentWeightKg ?? 0;
    for (const [index, offsetDays] of [60, 30, 0].entries()) {
      // Walk backwards from the current weight rather than forwards from birth:
      // the latest reading must match Pig.currentWeightKg exactly, or the
      // record page and the herd list disagree on the same animal.
      const weightKg = Math.max(1, Math.round((current - (2 - index) * current * 0.12) * 10) / 10);
      await prisma.weightRecord.create({
        data: {
          pigId: pig.id,
          recordedAt: daysAgo(offsetDays),
          weightKg,
          bodyConditionScore: 3,
        },
      });
    }
  }
}

async function seedHealth(farmId: string, subjects: PigRow[]) {
  const [sick, treated, sow] = subjects;

  await prisma.vaccinationProtocolItem.createMany({
    data: [
      { farmId, name: "Piglet iron + Mycoplasma", vaccineName: "Mycoplasma hyopneumoniae", targetStage: "PIGLET", ageDaysMin: 14, ageDaysMax: 21 },
      { farmId, name: "Weaner PRRS", vaccineName: "PRRS", targetStage: "WEANER", ageDaysMin: 42, ageDaysMax: 56 },
      { farmId, name: "Grower booster", vaccineName: "Circovirus", targetStage: "GROWER", ageDaysMin: 70, ageDaysMax: 84 },
      { farmId, name: "Sow annual parvo", vaccineName: "Parvovirus", targetStage: "SOW", boosterIntervalDays: 365 },
    ],
    skipDuplicates: true,
  });

  await prisma.vaccinationRecord.create({
    data: {
      pigId: sow.id,
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
      pigId: sick.id,
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
      pigId: treated.id,
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
            stage: type.classification === "GROWER" ? "GROWER" : type.classification === "FINISHER" ? "FINISHER" : "SOW",
            feedTypeId: feedType.id,
            dailyKgPerAnimal: type.classification === "GESTATION" ? 2.5 : 2.0,
          },
        });

        // Fourteen days of pen feeding, so feed conversion and the
        // consumption-drop detector have a series to work with.
        const penId = type.classification === "FINISHER" ? finisherPenId : growerPenId;
        const animalCount = await prisma.pig.count({ where: { penId } });

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
