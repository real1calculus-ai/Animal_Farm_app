"use client";

import { useState, type FormEvent } from "react";
import { usePowerSync, useQuery, useStatus } from "@powersync/react";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  HEALTH_CATEGORY_LABELS,
  HEALTH_RECORD_TYPE_LABELS,
  SEVERITY_LABELS,
  optionsFrom,
} from "@/lib/labels";

type AnimalRow = { id: string; tag_number: string; name: string | null; pen_name: string | null };
type HealthRow = {
  id: string;
  animal_id: string;
  recorded_at: string;
  record_type: string;
  category: string;
  severity: string;
  diagnosis: string;
};

const RECORD_TYPE_OPTIONS = optionsFrom(HEALTH_RECORD_TYPE_LABELS);
const CATEGORY_OPTIONS = optionsFrom(HEALTH_CATEGORY_LABELS);
const SEVERITY_OPTIONS = optionsFrom(SEVERITY_LABELS);

function nowForInput(): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Trimmed relative to the online form (src/components/health/health-record-form.tsx):
 * no medications sub-form, no "mark deceased" side effect, no edit/delete.
 * Those stay online-only for now — see docs/offline-first.md. The point of
 * this screen is the thing most likely to happen with no signal at all:
 * logging what was observed.
 */
export function HealthOfflineClient({ farmId }: { farmId: string }) {
  const db = usePowerSync();
  const status = useStatus();

  const { data: animals } = useQuery<AnimalRow>(
    "SELECT id, tag_number, name, pen_name FROM animals ORDER BY tag_number"
  );
  const { data: records } = useQuery<HealthRow>(
    "SELECT id, animal_id, recorded_at, record_type, category, severity, diagnosis FROM health_records ORDER BY recorded_at DESC LIMIT 25"
  );
  const { data: pendingRows } = useQuery<{ id: string }>("SELECT id FROM sync_pending");
  const pendingIds = new Set(pendingRows.map((r) => r.id));

  const [animalId, setAnimalId] = useState("");
  const [recordType, setRecordType] = useState<string>("ILLNESS");
  const [category, setCategory] = useState<string>("OTHER");
  const [severity, setSeverity] = useState<string>("MILD");
  const [recordedAt, setRecordedAt] = useState(nowForInput());
  const [diagnosis, setDiagnosis] = useState("");
  const [treatment, setTreatment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!animalId) {
      setError("Pick an animal.");
      return;
    }
    if (!diagnosis.trim()) {
      setError("Describe what you observed.");
      return;
    }

    setSubmitting(true);
    try {
      const id = crypto.randomUUID();
      const recordedAtIso = new Date(recordedAt).toISOString();

      // One local write transaction — the view-backed tables (see
      // src/lib/offline/schema.ts) translate these into CRUD queue entries
      // automatically; sync_pending is local-only and never queues.
      await db.writeTransaction(async (tx) => {
        await tx.execute(
          `INSERT INTO health_records
             (id, farm_id, animal_id, recorded_at, record_type, category, severity, diagnosis, treatment, outcome)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, farmId, animalId, recordedAtIso, recordType, category, severity, diagnosis.trim(), treatment.trim() || null, "ONGOING"]
        );
        await tx.execute(`INSERT INTO sync_pending (id, table_name) VALUES (?, ?)`, [id, "health_records"]);
      });

      setDiagnosis("");
      setTreatment("");
      setRecordedAt(nowForInput());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that locally.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 text-sm">
        <Badge variant={status.connected ? "success" : "warning"}>
          {status.connected ? "Online — syncing" : "Offline"}
        </Badge>
        {pendingIds.size > 0 && (
          <Badge variant="warning">
            {pendingIds.size} record{pendingIds.size === 1 ? "" : "s"} waiting to sync
          </Badge>
        )}
        {status.uploadError && <span className="text-red-600 dark:text-red-400">Last sync attempt failed — will retry automatically.</span>}
      </div>

      <Card>
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Record a health observation
        </h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Animal" htmlFor="animalId" required>
            <Select id="animalId" value={animalId} onChange={(e) => setAnimalId(e.target.value)} required>
              <option value="">Select an animal</option>
              {animals.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.tag_number}
                  {a.name ? ` — ${a.name}` : ""}
                  {a.pen_name ? ` (${a.pen_name})` : ""}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Type" htmlFor="recordType">
              <Select id="recordType" value={recordType} onChange={(e) => setRecordType(e.target.value)}>
                {RECORD_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Category" htmlFor="category">
              <Select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Severity" htmlFor="severity">
              <Select id="severity" value={severity} onChange={(e) => setSeverity(e.target.value)}>
                {SEVERITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Date & time" htmlFor="recordedAt" required>
            <Input
              id="recordedAt"
              type="datetime-local"
              value={recordedAt}
              onChange={(e) => setRecordedAt(e.target.value)}
              required
            />
          </Field>

          <Field label="What did you observe?" htmlFor="diagnosis" required>
            <Textarea
              id="diagnosis"
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              rows={2}
              required
            />
          </Field>

          <Field label="Treatment given (optional)" htmlFor="treatment">
            <Textarea id="treatment" value={treatment} onChange={(e) => setTreatment(e.target.value)} rows={2} />
          </Field>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <Button type="submit" disabled={submitting} className="self-start">
            {submitting ? "Saving…" : "Save"}
          </Button>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Saves to this device immediately, online or not. Syncs automatically once there&rsquo;s a
            connection — no need to wait or retry it yourself.
          </p>
        </form>
      </Card>

      <div>
        <h2 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">Recent observations</h2>
        {records.length === 0 ? (
          <EmptyState title="No health records on this device yet" description="Recorded observations, synced or not, show up here." />
        ) : (
          <ul className="flex flex-col gap-2">
            {records.map((r) => {
              const animal = animals.find((a) => a.id === r.animal_id);
              return (
                <li key={r.id}>
                  <Card className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                        {animal ? animal.tag_number : r.animal_id} — {r.diagnosis}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {new Date(r.recorded_at).toLocaleString()} · {HEALTH_RECORD_TYPE_LABELS[r.record_type as keyof typeof HEALTH_RECORD_TYPE_LABELS] ?? r.record_type}
                      </p>
                    </div>
                    {pendingIds.has(r.id) && <Badge variant="warning">Queued</Badge>}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
