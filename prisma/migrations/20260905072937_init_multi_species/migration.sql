-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'VETERINARIAN', 'WORKER');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "TrackingMode" AS ENUM ('INDIVIDUAL', 'BATCH', 'HYBRID');

-- CreateEnum
CREATE TYPE "SpeciesPurpose" AS ENUM ('LIVESTOCK', 'WORKING');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('ACTIVE', 'SOLD', 'CLOSED');

-- CreateEnum
CREATE TYPE "BatchEventType" AS ENUM ('STOCKED', 'MORTALITY', 'CULL', 'TRANSFER_OUT', 'TRANSFER_IN', 'SALE', 'WEIGHT_SAMPLE');

-- CreateEnum
CREATE TYPE "BatchProductionType" AS ENUM ('EGGS', 'MILK', 'OTHER');

-- CreateEnum
CREATE TYPE "AnimalStatus" AS ENUM ('ACTIVE', 'SOLD', 'DECEASED', 'CULLED', 'RETIRED');

-- CreateEnum
CREATE TYPE "AcquisitionType" AS ENUM ('BORN_ON_FARM', 'PURCHASED');

-- CreateEnum
CREATE TYPE "ExitReason" AS ENUM ('SOLD', 'DIED', 'CULLED', 'SLAUGHTERED', 'BREEDING_RETIREMENT');

-- CreateEnum
CREATE TYPE "HousingType" AS ENUM ('FARROWING', 'GESTATION', 'BREEDING', 'NURSERY', 'GROWER', 'FINISHER', 'BREEDING_MALE', 'ISOLATION', 'QUARANTINE');

-- CreateEnum
CREATE TYPE "LifeStage" AS ENUM ('YOUNG', 'WEANER', 'GROWER', 'FINISHER', 'MAIDEN_FEMALE', 'BREEDING_FEMALE', 'BREEDING_MALE');

-- CreateEnum
CREATE TYPE "BreedingMethod" AS ENUM ('NATURAL', 'ARTIFICIAL_INSEMINATION');

-- CreateEnum
CREATE TYPE "PregnancyStatus" AS ENUM ('PENDING', 'CONFIRMED', 'NOT_PREGNANT', 'FAILED', 'FARROWED', 'ABORTED');

-- CreateEnum
CREATE TYPE "ConfirmationMethod" AS ENUM ('ULTRASOUND', 'BEHAVIORAL', 'BLOOD_TEST', 'VISUAL');

-- CreateEnum
CREATE TYPE "HealthRecordType" AS ENUM ('ILLNESS', 'INJURY', 'VACCINATION', 'TREATMENT', 'EXAM');

-- CreateEnum
CREATE TYPE "HealthCategory" AS ENUM ('REPRODUCTIVE', 'RESPIRATORY', 'DIGESTIVE', 'MUSCULOSKELETAL', 'SKIN', 'PARASITIC', 'METABOLIC', 'BEHAVIORAL', 'OTHER');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('MILD', 'MODERATE', 'SEVERE');

-- CreateEnum
CREATE TYPE "HealthOutcome" AS ENUM ('RECOVERED', 'ONGOING', 'DEATH');

-- CreateEnum
CREATE TYPE "MedicationRoute" AS ENUM ('ORAL', 'INJECTION', 'FEED', 'TOPICAL');

-- CreateEnum
CREATE TYPE "FeedClassification" AS ENUM ('STARTER', 'WEANER', 'GROWER', 'FINISHER', 'GESTATION', 'LACTATION', 'BREEDING_MALE', 'SUPPLEMENT');

-- CreateEnum
CREATE TYPE "TransactionDirection" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "TransactionCategory" AS ENUM ('FEED', 'VETERINARY', 'LABOR', 'HOUSING', 'UTILITIES', 'BEDDING', 'EQUIPMENT', 'BREEDING', 'TRANSPORT', 'MARKETING', 'OTHER_EXPENSE', 'YOUNG_STOCK_SALE', 'FINISHED_PIG_SALE', 'CULL_SALE', 'BREEDING_STOCK_SALE', 'SERVICE_INCOME', 'OTHER_INCOME');

-- CreateEnum
CREATE TYPE "AnimalSaleType" AS ENUM ('FEEDER', 'FINISHED_PIG', 'BREEDING_STOCK', 'CULL');

-- CreateEnum
CREATE TYPE "EquipmentStatus" AS ENUM ('IN_SERVICE', 'NEEDS_REPAIR', 'RETIRED');

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('PREVENTIVE', 'REPAIR', 'INSPECTION');

-- CreateEnum
CREATE TYPE "PenTaskType" AS ENUM ('CLEANING', 'DISINFECTION', 'REPAIR');

-- CreateEnum
CREATE TYPE "HalfSibPolicy" AS ENUM ('ALLOW', 'WARN', 'BLOCK');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateTable
CREATE TABLE "Farm" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Farm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FarmSettings" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "currencyCode" TEXT NOT NULL DEFAULT 'NGN',
    "maxInbreedingCoefficient" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
    "warnInbreedingCoefficient" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "halfSibPolicy" "HalfSibPolicy" NOT NULL DEFAULT 'WARN',
    "maxSireUsesPerYear" INTEGER NOT NULL DEFAULT 20,
    "gestationDays" INTEGER NOT NULL DEFAULT 114,
    "gestationToleranceDays" INTEGER NOT NULL DEFAULT 3,
    "estrusCycleDays" INTEGER NOT NULL DEFAULT 21,
    "weaningAgeDays" INTEGER NOT NULL DEFAULT 28,
    "minBreedingAgeDaysFemale" INTEGER NOT NULL DEFAULT 240,
    "minBreedingAgeDaysMale" INTEGER NOT NULL DEFAULT 240,
    "minBreedingWeightKg" DOUBLE PRECISION NOT NULL DEFAULT 120,
    "outbreakCaseThreshold" INTEGER NOT NULL DEFAULT 3,
    "outbreakWindowDays" INTEGER NOT NULL DEFAULT 7,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FarmSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'WORKER',
    "farmId" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Animal" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "speciesId" TEXT NOT NULL,
    "tagNumber" TEXT NOT NULL,
    "name" TEXT,
    "breed" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "sex" "Sex" NOT NULL,
    "status" "AnimalStatus" NOT NULL DEFAULT 'ACTIVE',
    "motherId" TEXT,
    "fatherId" TEXT,
    "generation" INTEGER NOT NULL DEFAULT 0,
    "inbreedingCoefficient" DOUBLE PRECISION,
    "litterId" TEXT,
    "birthWeightKg" DOUBLE PRECISION,
    "markings" TEXT,
    "penId" TEXT,
    "dateMovedIn" TIMESTAMP(3),
    "currentWeightKg" DOUBLE PRECISION,
    "bodyConditionScore" INTEGER,
    "congenitalDefects" TEXT,
    "phenotypeNotes" TEXT,
    "acquisitionType" "AcquisitionType" NOT NULL DEFAULT 'BORN_ON_FARM',
    "dateAcquired" TIMESTAMP(3) NOT NULL,
    "acquisitionCostCents" INTEGER,
    "dateExit" TIMESTAMP(3),
    "exitReason" "ExitReason",
    "exitNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Animal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeightRecord" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "bodyConditionScore" INTEGER,
    "notes" TEXT,
    "recordedByProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeightRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pen" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "housingType" "HousingType" NOT NULL,
    "capacity" INTEGER NOT NULL,
    "location" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PenMovement" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "penId" TEXT,
    "fromPenName" TEXT,
    "toPenName" TEXT,
    "movedAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "movedByProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PenMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PenTask" (
    "id" TEXT NOT NULL,
    "penId" TEXT NOT NULL,
    "taskType" "PenTaskType" NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "costCents" INTEGER,
    "nextDueAt" TIMESTAMP(3),
    "performedByProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PenTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreedingRecord" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "damId" TEXT NOT NULL,
    "sireId" TEXT NOT NULL,
    "breedingDate" TIMESTAMP(3) NOT NULL,
    "method" "BreedingMethod" NOT NULL DEFAULT 'NATURAL',
    "expectedFarrowingDate" TIMESTAMP(3) NOT NULL,
    "pregnancyStatus" "PregnancyStatus" NOT NULL DEFAULT 'PENDING',
    "confirmationMethod" "ConfirmationMethod",
    "confirmationDate" TIMESTAMP(3),
    "expectedOffspringCount" INTEGER,
    "abnormalitiesNoted" TEXT,
    "offspringInbreedingCoefficient" DOUBLE PRECISION,
    "overrideReason" TEXT,
    "notes" TEXT,
    "createdByProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BreedingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Litter" (
    "id" TEXT NOT NULL,
    "breedingRecordId" TEXT NOT NULL,
    "farrowingDate" TIMESTAMP(3) NOT NULL,
    "farrowingDurationMinutes" INTEGER,
    "bornAlive" INTEGER NOT NULL,
    "stillborn" INTEGER NOT NULL DEFAULT 0,
    "mummified" INTEGER NOT NULL DEFAULT 0,
    "complications" TEXT,
    "vetInterventionRequired" BOOLEAN NOT NULL DEFAULT false,
    "colostrumIntakeObserved" BOOLEAN NOT NULL DEFAULT false,
    "postFarrowingCheckNotes" TEXT,
    "weaningDate" TIMESTAMP(3),
    "weanedCount" INTEGER,
    "notes" TEXT,
    "createdByProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Litter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstrusRecord" (
    "id" TEXT NOT NULL,
    "sowId" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "signRestlessness" BOOLEAN NOT NULL DEFAULT false,
    "signSwollenVulva" BOOLEAN NOT NULL DEFAULT false,
    "signDischarge" BOOLEAN NOT NULL DEFAULT false,
    "signReceptive" BOOLEAN NOT NULL DEFAULT false,
    "durationHours" INTEGER,
    "wasBred" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdByProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstrusRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthRecord" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "animalId" TEXT,
    "batchId" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "recordType" "HealthRecordType" NOT NULL,
    "category" "HealthCategory" NOT NULL,
    "severity" "Severity" NOT NULL DEFAULT 'MILD',
    "diagnosis" TEXT NOT NULL,
    "treatment" TEXT,
    "vetNotes" TEXT,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "outcome" "HealthOutcome" NOT NULL DEFAULT 'ONGOING',
    "resolvedAt" TIMESTAMP(3),
    "createdByProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Medication" (
    "id" TEXT NOT NULL,
    "healthRecordId" TEXT NOT NULL,
    "drugName" TEXT NOT NULL,
    "dosage" TEXT,
    "route" "MedicationRoute" NOT NULL DEFAULT 'ORAL',
    "startDate" TIMESTAMP(3) NOT NULL,
    "durationDays" INTEGER,
    "completedDate" TIMESTAMP(3),
    "withdrawalDays" INTEGER NOT NULL DEFAULT 0,
    "isAntibiotic" BOOLEAN NOT NULL DEFAULT false,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Medication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaccinationProtocolItem" (
    "speciesId" TEXT,
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vaccineName" TEXT NOT NULL,
    "targetStage" "LifeStage" NOT NULL,
    "ageDaysMin" INTEGER,
    "ageDaysMax" INTEGER,
    "boosterIntervalDays" INTEGER,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaccinationProtocolItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaccinationRecord" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "protocolItemId" TEXT,
    "vaccineName" TEXT NOT NULL,
    "administeredAt" TIMESTAMP(3) NOT NULL,
    "lotNumber" TEXT,
    "veterinarian" TEXT,
    "nextDueDate" TIMESTAMP(3),
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdByProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaccinationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedType" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "classification" "FeedClassification" NOT NULL,
    "description" TEXT,
    "proteinPct" DOUBLE PRECISION,
    "fatPct" DOUBLE PRECISION,
    "fiberPct" DOUBLE PRECISION,
    "calciumPct" DOUBLE PRECISION,
    "phosphorusPct" DOUBLE PRECISION,
    "vitamins" TEXT,
    "meKcalPerKg" DOUBLE PRECISION,
    "costPerKgCents" INTEGER,
    "supplierId" TEXT,
    "storageRequirements" TEXT,
    "reorderLevelKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedStorageLocation" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacityKg" DOUBLE PRECISION,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedStorageLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedBatch" (
    "id" TEXT NOT NULL,
    "feedTypeId" TEXT NOT NULL,
    "batchCode" TEXT NOT NULL,
    "supplierLotNumber" TEXT,
    "supplierId" TEXT,
    "receivedDate" TIMESTAMP(3) NOT NULL,
    "expirationDate" TIMESTAMP(3),
    "quantityKg" DOUBLE PRECISION NOT NULL,
    "remainingKg" DOUBLE PRECISION NOT NULL,
    "costPerKgCents" INTEGER NOT NULL,
    "storageLocationId" TEXT,
    "nutritionalAnalysis" TEXT,
    "qualityNotes" TEXT,
    "receivedByProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedingProgram" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "speciesId" TEXT,
    "stage" "LifeStage" NOT NULL,
    "feedTypeId" TEXT NOT NULL,
    "dailyKgPerAnimal" DOUBLE PRECISION NOT NULL,
    "ageDaysMin" INTEGER,
    "ageDaysMax" INTEGER,
    "pctOfBodyweight" DOUBLE PRECISION,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedingProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedingRecord" (
    "batchId" TEXT,
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "fedAt" TIMESTAMP(3) NOT NULL,
    "penId" TEXT,
    "animalId" TEXT,
    "animalCount" INTEGER NOT NULL DEFAULT 1,
    "feedTypeId" TEXT NOT NULL,
    "feedBatchId" TEXT,
    "allocatedKg" DOUBLE PRECISION NOT NULL,
    "consumedKg" DOUBLE PRECISION,
    "costPerKgCents" INTEGER,
    "notes" TEXT,
    "recordedByProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialTransaction" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "direction" "TransactionDirection" NOT NULL,
    "category" "TransactionCategory" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "description" TEXT,
    "animalId" TEXT,
    "feedBatchId" TEXT,
    "healthRecordId" TEXT,
    "animalSaleId" TEXT,
    "equipmentId" TEXT,
    "createdByProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalSale" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "soldAt" TIMESTAMP(3) NOT NULL,
    "saleType" "AnimalSaleType" NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerContact" TEXT,
    "notes" TEXT,
    "totalCents" INTEGER NOT NULL,
    "createdByProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnimalSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalSaleItem" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "pricePerKgCents" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "carcassGrade" TEXT,

    CONSTRAINT "AnimalSaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "serialNumber" TEXT,
    "location" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "purchaseCostCents" INTEGER,
    "expectedLifeMonths" INTEGER,
    "status" "EquipmentStatus" NOT NULL DEFAULT 'IN_SERVICE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceRecord" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL,
    "maintenanceType" "MaintenanceType" NOT NULL,
    "description" TEXT NOT NULL,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "nextDueAt" TIMESTAMP(3),
    "createdByProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertAcknowledgement" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "alertKey" TEXT NOT NULL,
    "note" TEXT,
    "snoozedUntil" TIMESTAMP(3),
    "acknowledgedByProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "profileId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT,
    "actorName" TEXT,
    "actorEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Species" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "trackingMode" "TrackingMode" NOT NULL DEFAULT 'INDIVIDUAL',
    "purpose" "SpeciesPurpose" NOT NULL DEFAULT 'LIVESTOCK',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "gestationDays" INTEGER,
    "gestationToleranceDays" INTEGER NOT NULL DEFAULT 3,
    "estrusCycleDays" INTEGER,
    "weaningAgeDays" INTEGER,
    "minBreedingAgeDaysFemale" INTEGER,
    "minBreedingAgeDaysMale" INTEGER,
    "minBreedingWeightKg" DOUBLE PRECISION,
    "typicalLitterSize" INTEGER,
    "hasSex" BOOLEAN NOT NULL DEFAULT true,
    "tracksPedigree" BOOLEAN NOT NULL DEFAULT true,
    "birthEventTerm" TEXT NOT NULL DEFAULT 'birth',
    "youngTerm" TEXT NOT NULL DEFAULT 'young',
    "adultFemaleTerm" TEXT NOT NULL DEFAULT 'female',
    "adultMaleTerm" TEXT NOT NULL DEFAULT 'male',
    "groupTerm" TEXT NOT NULL DEFAULT 'group',
    "bodyConditionScaleMax" INTEGER NOT NULL DEFAULT 5,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Species_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalBatch" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "speciesId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "batchCode" TEXT NOT NULL,
    "penId" TEXT,
    "status" "BatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3) NOT NULL,
    "startAgeDays" INTEGER NOT NULL DEFAULT 0,
    "endDate" TIMESTAMP(3),
    "initialCount" INTEGER NOT NULL,
    "currentCount" INTEGER NOT NULL,
    "source" TEXT,
    "acquisitionCostCents" INTEGER,
    "avgWeightKg" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnimalBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchEvent" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "eventType" "BatchEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "weightKg" DOUBLE PRECISION,
    "reason" TEXT,
    "notes" TEXT,
    "createdByProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchProductionRecord" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "productionType" "BatchProductionType" NOT NULL DEFAULT 'EGGS',
    "collectedAt" TIMESTAMP(3) NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'count',
    "rejectedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdByProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatchProductionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthAttempt" (
    "id" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "succeeded" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AuthAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Farm_name_key" ON "Farm"("name");

-- CreateIndex
CREATE UNIQUE INDEX "FarmSettings_farmId_key" ON "FarmSettings"("farmId");

-- CreateIndex
CREATE INDEX "Profile_farmId_idx" ON "Profile"("farmId");

-- CreateIndex
CREATE INDEX "Animal_speciesId_status_idx" ON "Animal"("speciesId", "status");

-- CreateIndex
CREATE INDEX "Animal_farmId_status_idx" ON "Animal"("farmId", "status");

-- CreateIndex
CREATE INDEX "Animal_motherId_idx" ON "Animal"("motherId");

-- CreateIndex
CREATE INDEX "Animal_fatherId_idx" ON "Animal"("fatherId");

-- CreateIndex
CREATE INDEX "Animal_penId_idx" ON "Animal"("penId");

-- CreateIndex
CREATE INDEX "Animal_farmId_sex_status_idx" ON "Animal"("farmId", "sex", "status");

-- CreateIndex
CREATE INDEX "Animal_dateOfBirth_idx" ON "Animal"("dateOfBirth");

-- CreateIndex
CREATE UNIQUE INDEX "Animal_farmId_tagNumber_key" ON "Animal"("farmId", "tagNumber");

-- CreateIndex
CREATE INDEX "WeightRecord_animalId_recordedAt_idx" ON "WeightRecord"("animalId", "recordedAt");

-- CreateIndex
CREATE INDEX "Pen_farmId_housingType_idx" ON "Pen"("farmId", "housingType");

-- CreateIndex
CREATE UNIQUE INDEX "Pen_farmId_name_key" ON "Pen"("farmId", "name");

-- CreateIndex
CREATE INDEX "PenMovement_animalId_movedAt_idx" ON "PenMovement"("animalId", "movedAt");

-- CreateIndex
CREATE INDEX "PenMovement_penId_movedAt_idx" ON "PenMovement"("penId", "movedAt");

-- CreateIndex
CREATE INDEX "PenTask_penId_performedAt_idx" ON "PenTask"("penId", "performedAt");

-- CreateIndex
CREATE INDEX "BreedingRecord_farmId_breedingDate_idx" ON "BreedingRecord"("farmId", "breedingDate");

-- CreateIndex
CREATE INDEX "BreedingRecord_damId_breedingDate_idx" ON "BreedingRecord"("damId", "breedingDate");

-- CreateIndex
CREATE INDEX "BreedingRecord_sireId_breedingDate_idx" ON "BreedingRecord"("sireId", "breedingDate");

-- CreateIndex
CREATE INDEX "BreedingRecord_farmId_pregnancyStatus_idx" ON "BreedingRecord"("farmId", "pregnancyStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Litter_breedingRecordId_key" ON "Litter"("breedingRecordId");

-- CreateIndex
CREATE INDEX "Litter_farrowingDate_idx" ON "Litter"("farrowingDate");

-- CreateIndex
CREATE INDEX "EstrusRecord_sowId_observedAt_idx" ON "EstrusRecord"("sowId", "observedAt");

-- CreateIndex
CREATE INDEX "HealthRecord_farmId_recordedAt_idx" ON "HealthRecord"("farmId", "recordedAt");

-- CreateIndex
CREATE INDEX "HealthRecord_animalId_recordedAt_idx" ON "HealthRecord"("animalId", "recordedAt");

-- CreateIndex
CREATE INDEX "HealthRecord_batchId_recordedAt_idx" ON "HealthRecord"("batchId", "recordedAt");

-- CreateIndex
CREATE INDEX "HealthRecord_farmId_category_recordedAt_idx" ON "HealthRecord"("farmId", "category", "recordedAt");

-- CreateIndex
CREATE INDEX "HealthRecord_farmId_diagnosis_recordedAt_idx" ON "HealthRecord"("farmId", "diagnosis", "recordedAt");

-- CreateIndex
CREATE INDEX "Medication_healthRecordId_idx" ON "Medication"("healthRecordId");

-- CreateIndex
CREATE INDEX "Medication_drugName_idx" ON "Medication"("drugName");

-- CreateIndex
CREATE INDEX "VaccinationProtocolItem_farmId_targetStage_idx" ON "VaccinationProtocolItem"("farmId", "targetStage");

-- CreateIndex
CREATE INDEX "VaccinationRecord_animalId_administeredAt_idx" ON "VaccinationRecord"("animalId", "administeredAt");

-- CreateIndex
CREATE INDEX "VaccinationRecord_nextDueDate_idx" ON "VaccinationRecord"("nextDueDate");

-- CreateIndex
CREATE INDEX "VaccinationRecord_lotNumber_idx" ON "VaccinationRecord"("lotNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_farmId_name_key" ON "Supplier"("farmId", "name");

-- CreateIndex
CREATE INDEX "FeedType_farmId_classification_idx" ON "FeedType"("farmId", "classification");

-- CreateIndex
CREATE UNIQUE INDEX "FeedType_farmId_name_key" ON "FeedType"("farmId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "FeedStorageLocation_farmId_name_key" ON "FeedStorageLocation"("farmId", "name");

-- CreateIndex
CREATE INDEX "FeedBatch_feedTypeId_receivedDate_idx" ON "FeedBatch"("feedTypeId", "receivedDate");

-- CreateIndex
CREATE INDEX "FeedBatch_expirationDate_idx" ON "FeedBatch"("expirationDate");

-- CreateIndex
CREATE INDEX "FeedingProgram_farmId_stage_idx" ON "FeedingProgram"("farmId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "FeedingProgram_farmId_name_key" ON "FeedingProgram"("farmId", "name");

-- CreateIndex
CREATE INDEX "FeedingRecord_farmId_fedAt_idx" ON "FeedingRecord"("farmId", "fedAt");

-- CreateIndex
CREATE INDEX "FeedingRecord_penId_fedAt_idx" ON "FeedingRecord"("penId", "fedAt");

-- CreateIndex
CREATE INDEX "FeedingRecord_animalId_fedAt_idx" ON "FeedingRecord"("animalId", "fedAt");

-- CreateIndex
CREATE INDEX "FeedingRecord_feedBatchId_idx" ON "FeedingRecord"("feedBatchId");

-- CreateIndex
CREATE INDEX "FinancialTransaction_farmId_occurredAt_idx" ON "FinancialTransaction"("farmId", "occurredAt");

-- CreateIndex
CREATE INDEX "FinancialTransaction_farmId_direction_occurredAt_idx" ON "FinancialTransaction"("farmId", "direction", "occurredAt");

-- CreateIndex
CREATE INDEX "FinancialTransaction_farmId_category_occurredAt_idx" ON "FinancialTransaction"("farmId", "category", "occurredAt");

-- CreateIndex
CREATE INDEX "FinancialTransaction_animalId_idx" ON "FinancialTransaction"("animalId");

-- CreateIndex
CREATE INDEX "AnimalSale_farmId_soldAt_idx" ON "AnimalSale"("farmId", "soldAt");

-- CreateIndex
CREATE INDEX "AnimalSaleItem_animalId_idx" ON "AnimalSaleItem"("animalId");

-- CreateIndex
CREATE UNIQUE INDEX "AnimalSaleItem_saleId_animalId_key" ON "AnimalSaleItem"("saleId", "animalId");

-- CreateIndex
CREATE INDEX "Equipment_farmId_status_idx" ON "Equipment"("farmId", "status");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_equipmentId_performedAt_idx" ON "MaintenanceRecord"("equipmentId", "performedAt");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_nextDueAt_idx" ON "MaintenanceRecord"("nextDueAt");

-- CreateIndex
CREATE INDEX "AlertAcknowledgement_farmId_idx" ON "AlertAcknowledgement"("farmId");

-- CreateIndex
CREATE UNIQUE INDEX "AlertAcknowledgement_farmId_alertKey_key" ON "AlertAcknowledgement"("farmId", "alertKey");

-- CreateIndex
CREATE INDEX "AuditLog_farmId_createdAt_idx" ON "AuditLog"("farmId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Species_farmId_trackingMode_idx" ON "Species"("farmId", "trackingMode");

-- CreateIndex
CREATE UNIQUE INDEX "Species_farmId_name_key" ON "Species"("farmId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Species_farmId_code_key" ON "Species"("farmId", "code");

-- CreateIndex
CREATE INDEX "AnimalBatch_farmId_status_idx" ON "AnimalBatch"("farmId", "status");

-- CreateIndex
CREATE INDEX "AnimalBatch_speciesId_idx" ON "AnimalBatch"("speciesId");

-- CreateIndex
CREATE INDEX "AnimalBatch_penId_idx" ON "AnimalBatch"("penId");

-- CreateIndex
CREATE UNIQUE INDEX "AnimalBatch_farmId_batchCode_key" ON "AnimalBatch"("farmId", "batchCode");

-- CreateIndex
CREATE INDEX "BatchEvent_batchId_occurredAt_idx" ON "BatchEvent"("batchId", "occurredAt");

-- CreateIndex
CREATE INDEX "BatchEvent_eventType_idx" ON "BatchEvent"("eventType");

-- CreateIndex
CREATE INDEX "BatchProductionRecord_batchId_collectedAt_idx" ON "BatchProductionRecord"("batchId", "collectedAt");

-- CreateIndex
CREATE INDEX "AuthAttempt_keyHash_attemptedAt_idx" ON "AuthAttempt"("keyHash", "attemptedAt");

-- CreateIndex
CREATE INDEX "AuthAttempt_attemptedAt_idx" ON "AuthAttempt"("attemptedAt");

-- AddForeignKey
ALTER TABLE "FarmSettings" ADD CONSTRAINT "FarmSettings_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Animal" ADD CONSTRAINT "Animal_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Animal" ADD CONSTRAINT "Animal_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "Species"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Animal" ADD CONSTRAINT "Animal_motherId_fkey" FOREIGN KEY ("motherId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Animal" ADD CONSTRAINT "Animal_fatherId_fkey" FOREIGN KEY ("fatherId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Animal" ADD CONSTRAINT "Animal_litterId_fkey" FOREIGN KEY ("litterId") REFERENCES "Litter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Animal" ADD CONSTRAINT "Animal_penId_fkey" FOREIGN KEY ("penId") REFERENCES "Pen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeightRecord" ADD CONSTRAINT "WeightRecord_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeightRecord" ADD CONSTRAINT "WeightRecord_recordedByProfileId_fkey" FOREIGN KEY ("recordedByProfileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pen" ADD CONSTRAINT "Pen_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PenMovement" ADD CONSTRAINT "PenMovement_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PenMovement" ADD CONSTRAINT "PenMovement_penId_fkey" FOREIGN KEY ("penId") REFERENCES "Pen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PenMovement" ADD CONSTRAINT "PenMovement_movedByProfileId_fkey" FOREIGN KEY ("movedByProfileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PenTask" ADD CONSTRAINT "PenTask_penId_fkey" FOREIGN KEY ("penId") REFERENCES "Pen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PenTask" ADD CONSTRAINT "PenTask_performedByProfileId_fkey" FOREIGN KEY ("performedByProfileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedingRecord" ADD CONSTRAINT "BreedingRecord_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedingRecord" ADD CONSTRAINT "BreedingRecord_damId_fkey" FOREIGN KEY ("damId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedingRecord" ADD CONSTRAINT "BreedingRecord_sireId_fkey" FOREIGN KEY ("sireId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedingRecord" ADD CONSTRAINT "BreedingRecord_createdByProfileId_fkey" FOREIGN KEY ("createdByProfileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Litter" ADD CONSTRAINT "Litter_breedingRecordId_fkey" FOREIGN KEY ("breedingRecordId") REFERENCES "BreedingRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Litter" ADD CONSTRAINT "Litter_createdByProfileId_fkey" FOREIGN KEY ("createdByProfileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstrusRecord" ADD CONSTRAINT "EstrusRecord_sowId_fkey" FOREIGN KEY ("sowId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstrusRecord" ADD CONSTRAINT "EstrusRecord_createdByProfileId_fkey" FOREIGN KEY ("createdByProfileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthRecord" ADD CONSTRAINT "HealthRecord_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthRecord" ADD CONSTRAINT "HealthRecord_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthRecord" ADD CONSTRAINT "HealthRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "AnimalBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthRecord" ADD CONSTRAINT "HealthRecord_createdByProfileId_fkey" FOREIGN KEY ("createdByProfileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Medication" ADD CONSTRAINT "Medication_healthRecordId_fkey" FOREIGN KEY ("healthRecordId") REFERENCES "HealthRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaccinationProtocolItem" ADD CONSTRAINT "VaccinationProtocolItem_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "Species"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaccinationProtocolItem" ADD CONSTRAINT "VaccinationProtocolItem_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaccinationRecord" ADD CONSTRAINT "VaccinationRecord_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaccinationRecord" ADD CONSTRAINT "VaccinationRecord_protocolItemId_fkey" FOREIGN KEY ("protocolItemId") REFERENCES "VaccinationProtocolItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaccinationRecord" ADD CONSTRAINT "VaccinationRecord_createdByProfileId_fkey" FOREIGN KEY ("createdByProfileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedType" ADD CONSTRAINT "FeedType_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedType" ADD CONSTRAINT "FeedType_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedStorageLocation" ADD CONSTRAINT "FeedStorageLocation_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedBatch" ADD CONSTRAINT "FeedBatch_feedTypeId_fkey" FOREIGN KEY ("feedTypeId") REFERENCES "FeedType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedBatch" ADD CONSTRAINT "FeedBatch_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedBatch" ADD CONSTRAINT "FeedBatch_storageLocationId_fkey" FOREIGN KEY ("storageLocationId") REFERENCES "FeedStorageLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedBatch" ADD CONSTRAINT "FeedBatch_receivedByProfileId_fkey" FOREIGN KEY ("receivedByProfileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedingProgram" ADD CONSTRAINT "FeedingProgram_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedingProgram" ADD CONSTRAINT "FeedingProgram_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "Species"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedingProgram" ADD CONSTRAINT "FeedingProgram_feedTypeId_fkey" FOREIGN KEY ("feedTypeId") REFERENCES "FeedType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedingRecord" ADD CONSTRAINT "FeedingRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "AnimalBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedingRecord" ADD CONSTRAINT "FeedingRecord_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedingRecord" ADD CONSTRAINT "FeedingRecord_penId_fkey" FOREIGN KEY ("penId") REFERENCES "Pen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedingRecord" ADD CONSTRAINT "FeedingRecord_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedingRecord" ADD CONSTRAINT "FeedingRecord_feedTypeId_fkey" FOREIGN KEY ("feedTypeId") REFERENCES "FeedType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedingRecord" ADD CONSTRAINT "FeedingRecord_feedBatchId_fkey" FOREIGN KEY ("feedBatchId") REFERENCES "FeedBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedingRecord" ADD CONSTRAINT "FeedingRecord_recordedByProfileId_fkey" FOREIGN KEY ("recordedByProfileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_animalSaleId_fkey" FOREIGN KEY ("animalSaleId") REFERENCES "AnimalSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_createdByProfileId_fkey" FOREIGN KEY ("createdByProfileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalSale" ADD CONSTRAINT "AnimalSale_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalSale" ADD CONSTRAINT "AnimalSale_createdByProfileId_fkey" FOREIGN KEY ("createdByProfileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalSaleItem" ADD CONSTRAINT "AnimalSaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "AnimalSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalSaleItem" ADD CONSTRAINT "AnimalSaleItem_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRecord" ADD CONSTRAINT "MaintenanceRecord_createdByProfileId_fkey" FOREIGN KEY ("createdByProfileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertAcknowledgement" ADD CONSTRAINT "AlertAcknowledgement_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertAcknowledgement" ADD CONSTRAINT "AlertAcknowledgement_acknowledgedByProfileId_fkey" FOREIGN KEY ("acknowledgedByProfileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Species" ADD CONSTRAINT "Species_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalBatch" ADD CONSTRAINT "AnimalBatch_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalBatch" ADD CONSTRAINT "AnimalBatch_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "Species"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalBatch" ADD CONSTRAINT "AnimalBatch_penId_fkey" FOREIGN KEY ("penId") REFERENCES "Pen"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchEvent" ADD CONSTRAINT "BatchEvent_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "AnimalBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchEvent" ADD CONSTRAINT "BatchEvent_createdByProfileId_fkey" FOREIGN KEY ("createdByProfileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchProductionRecord" ADD CONSTRAINT "BatchProductionRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "AnimalBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchProductionRecord" ADD CONSTRAINT "BatchProductionRecord_createdByProfileId_fkey" FOREIGN KEY ("createdByProfileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
