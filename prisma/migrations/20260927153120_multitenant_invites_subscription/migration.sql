-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('FREE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateTable
CREATE TABLE "FarmInvite" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'WORKER',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdByProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FarmInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FarmInvite_tokenHash_key" ON "FarmInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "FarmInvite_farmId_acceptedAt_idx" ON "FarmInvite"("farmId", "acceptedAt");

-- CreateIndex
CREATE INDEX "FarmInvite_email_idx" ON "FarmInvite"("email");

-- AddForeignKey
ALTER TABLE "FarmInvite" ADD CONSTRAINT "FarmInvite_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmInvite" ADD CONSTRAINT "FarmInvite_createdByProfileId_fkey" FOREIGN KEY ("createdByProfileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
--
-- Every farm-owned table is restricted to one tenant per transaction.
--
-- Two things make this actually bite, and both are easy to leave out:
--
--   1. FORCE ROW LEVEL SECURITY. Plain ENABLE is bypassed by the table owner,
--      and Prisma connects as the owner — so ENABLE alone buys nothing while
--      looking like it does. FORCE applies the policy to the owner too.
--
--   2. The tenant comes from a transaction-local setting, not from the
--      connection. The app is serverless behind a pooler, so a connection is
--      shared between requests and anything set per-connection would leak
--      across tenants. `set_config(..., true)` is scoped to the transaction
--      and is discarded when it ends.
--
-- The policy fails CLOSED: with no setting, current_farm_id() is NULL, the
-- comparison is NULL, and no row matches. A query that forgets to establish
-- its tenant returns nothing rather than returning everything.

CREATE OR REPLACE FUNCTION current_farm_id() RETURNS text AS $$
  SELECT NULLIF(current_setting('app.farm_id', true), '');
$$ LANGUAGE sql STABLE;

DO $$
DECLARE
  -- Tables carrying farmId directly.
  direct_tables text[] := ARRAY[
    'Species','Animal','Pen','AnimalBatch','BreedingRecord','HealthRecord',
    'VaccinationProtocolItem','FeedType','FeedStorageLocation','FeedingProgram',
    'FeedingRecord','Supplier','FinancialTransaction','AnimalSale','Equipment',
    'AlertAcknowledgement','AuditLog','FarmInvite'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY direct_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("farmId" = current_farm_id()) WITH CHECK ("farmId" = current_farm_id())',
      t
    );
  END LOOP;
END $$;

-- The farm itself: a tenant sees only its own row.
ALTER TABLE "Farm" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Farm" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Farm";
CREATE POLICY tenant_isolation ON "Farm"
  USING (id = current_farm_id()) WITH CHECK (id = current_farm_id());

ALTER TABLE "FarmSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FarmSettings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "FarmSettings";
CREATE POLICY tenant_isolation ON "FarmSettings"
  USING ("farmId" = current_farm_id()) WITH CHECK ("farmId" = current_farm_id());

-- Profile is deliberately looser on read: sign-in has to find the profile
-- *before* it knows which farm the user belongs to, so gating the lookup on
-- the tenant would make logging in impossible. A profile row holds a name,
-- an email and a role — not farm business data — and every screen behind it
-- is still tenant-scoped.
ALTER TABLE "Profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Profile" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Profile";
CREATE POLICY tenant_isolation ON "Profile"
  USING ("farmId" IS NULL OR "farmId" = current_farm_id() OR current_farm_id() IS NULL)
  WITH CHECK (true);

-- Child tables reach their tenant through a parent. Written as EXISTS rather
-- than a denormalised farmId so there is no second copy of the tenant key to
-- drift out of step with the first.
DO $$
DECLARE
  child record;
BEGIN
  FOR child IN
    SELECT * FROM (VALUES
      ('WeightRecord',          'Animal',        'animalId'),
      ('PenMovement',           'Animal',        'animalId'),
      ('EstrusRecord',          'Animal',        'sowId'),
      ('AnimalSaleItem',        'AnimalSale',    'saleId'),
      ('PenTask',               'Pen',           'penId'),
      ('BatchEvent',            'AnimalBatch',   'batchId'),
      ('BatchProductionRecord', 'AnimalBatch',   'batchId'),
      ('Litter',                'BreedingRecord','breedingRecordId'),
      ('Medication',            'HealthRecord',  'healthRecordId'),
      ('MaintenanceRecord',     'Equipment',     'equipmentId'),
      ('FeedBatch',             'FeedType',      'feedTypeId'),
      ('VaccinationRecord',     'Animal',        'animalId')
    ) AS t(child_table, parent_table, fk)
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', child.child_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', child.child_table);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', child.child_table);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (EXISTS (SELECT 1 FROM %I p WHERE p.id = %I.%I AND p."farmId" = current_farm_id())) WITH CHECK (EXISTS (SELECT 1 FROM %I p WHERE p.id = %I.%I AND p."farmId" = current_farm_id()))',
      child.child_table, child.parent_table, child.child_table, child.fk,
      child.parent_table, child.child_table, child.fk
    );
  END LOOP;
END $$;

-- AuthAttempt holds no tenant data — it is hashed throttling counters read
-- before anyone is authenticated, so it stays outside the tenant model.
