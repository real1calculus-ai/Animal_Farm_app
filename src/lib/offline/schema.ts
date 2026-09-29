import { column, Schema, Table } from "@powersync/web";

/**
 * The local SQLite schema PowerSync replicates into the browser/device.
 *
 * This is deliberately a small slice, not a mirror of prisma/schema.prisma:
 * `animals` carries only what the offline health form needs to show a
 * picker (not every field on the real Animal model), and the only
 * farm-owned records replicated at all are health records and their
 * medications — the first offline-capable domain. Widening this to other
 * domains means adding tables here and to sync-rules.yaml together.
 *
 * PowerSync tables are untyped JSON-backed rows by design (see Table.d.ts
 * in @powersync/web) — every column is TEXT/INTEGER/REAL, so booleans and
 * dates are stored as 0/1 and ISO strings and converted at the read/write
 * boundary, same as SQLite itself has no native boolean or date type.
 */

const animals = new Table({
  farm_id: column.text,
  tag_number: column.text,
  name: column.text,
  species_id: column.text,
  pen_name: column.text,
});

const health_records = new Table(
  {
    farm_id: column.text,
    animal_id: column.text,
    batch_id: column.text,
    recorded_at: column.text,
    record_type: column.text,
    category: column.text,
    severity: column.text,
    diagnosis: column.text,
    treatment: column.text,
    vet_notes: column.text,
    outcome: column.text,
  },
  { indexes: { by_farm: ["farm_id"], by_animal: ["animal_id"] } }
);

/**
 * Tracks which locally-created rows haven't been confirmed by the backend
 * yet, for the "queued" badge in the UI. `localOnly: true` (via
 * `createLocalOnly`) is what makes this safe: a normal column on a synced
 * table would itself get queued as a new write the moment `uploadData`
 * cleared it, forever re-queuing itself. A local-only table's writes never
 * enter the CRUD queue at all, so clearing an entry here after a
 * successful upload (connector.ts) is just local bookkeeping.
 */
const sync_pending = Table.createLocalOnly({
  table_name: column.text,
});

const medications = new Table(
  {
    health_record_id: column.text,
    drug_name: column.text,
    dosage: column.text,
    route: column.text,
    start_date: column.text,
    withdrawal_days: column.integer,
    is_antibiotic: column.integer,
    notes: column.text,
  },
  { indexes: { by_health_record: ["health_record_id"] } }
);

export const AppSchema = new Schema({
  animals,
  health_records,
  medications,
  sync_pending,
});

export type Database = (typeof AppSchema)["types"];
