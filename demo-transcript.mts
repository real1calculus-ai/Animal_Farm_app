/**
 * Generates a public demo transcript from entirely synthetic animals.
 *
 * Deliberately no database and no seeded farm: this runs on fabricated
 * pedigrees defined in this file, so the output can be published without any
 * path back to real records. This script stays in the private repository;
 * only its output is published.
 */
import { createInbreedingCalculator, pedigreeCompleteness } from "@/lib/breeding/inbreeding";
import { classifyRelationship, ancestryDiversity, type PedigreeIndex, type PedigreeNode } from "@/lib/breeding/pedigree";
import { computeWithdrawalStatus } from "@/lib/health/withdrawal-period";
import { allocateFifo, FeedAllocationError } from "@/lib/feed/allocation";
import { countFromEvents, mortalityStats, batchFcr, layPercentage } from "@/lib/batch-metrics";

const line = (s = "") => console.log(s);
const rule = (t: string) => { line(); line("=".repeat(72)); line(t); line("=".repeat(72)); };

function idx(specs: {id:string;sex:"MALE"|"FEMALE";m?:string;f?:string;born:number}[]): PedigreeIndex {
  const map: PedigreeIndex = new Map();
  specs.forEach((s, i) => {
    const n: PedigreeNode = { id: s.id, tagNumber: s.id, name: null, sex: s.sex,
      dateOfBirth: new Date(2020 + s.born, 0, 1 + i), motherId: s.m ?? null, fatherId: s.f ?? null };
    map.set(s.id, n);
  });
  return map;
}

rule("1. INBREEDING — Wright's coefficient via kinship recursion");
line("Synthetic pedigree. Values are fixed by genetics, not by this code.");
line();

const herd = idx([
  { id: "GD", sex: "FEMALE", born: 0 }, { id: "GS", sex: "MALE", born: 0 },
  { id: "P1", sex: "FEMALE", m: "GD", f: "GS", born: 1 },
  { id: "P2", sex: "MALE",   m: "GD", f: "GS", born: 1 },
  { id: "OUT_M", sex: "MALE", born: 1 }, { id: "OUT_F", sex: "FEMALE", born: 1 },
  { id: "C1", sex: "FEMALE", m: "P1", f: "OUT_M", born: 2 },
  { id: "C2", sex: "MALE",   m: "OUT_F", f: "P2",  born: 2 },
  { id: "INBRED_SIRE", sex: "MALE", m: "P1", f: "P2", born: 2 },
  { id: "D1", sex: "FEMALE", born: 2 }, { id: "D2", sex: "FEMALE", born: 2 },
  { id: "H1", sex: "FEMALE", m: "D1", f: "INBRED_SIRE", born: 3 },
  { id: "H2", sex: "MALE",   m: "D2", f: "INBRED_SIRE", born: 3 },
]);
const calc = createInbreedingCalculator(herd);

const cases: [string, string, string, number][] = [
  ["full siblings",                      "P1", "P2", 0.25],
  ["parent and offspring",               "P1", "C1", 0.25],
  ["first cousins",                      "C1", "C2", 0.0625],
  ["half sibs through an INBRED sire",   "H1", "H2", 0.15625],
  ["unrelated founders",                 "GD", "OUT_M", 0],
];
for (const [label, a, b, expected] of cases) {
  const f = calc.offspringInbreeding(b, a);
  const ok = Math.abs(f - expected) < 1e-9;
  line(`  ${label.padEnd(36)} F = ${(f * 100).toFixed(3).padStart(7)}%   expected ${(expected * 100).toFixed(3)}%  ${ok ? "OK" : "MISMATCH"}`);
}
line();
line("  The fourth case is the one naive path-counting gets wrong: the sire is");
line("  himself the product of a full-sib mating, and the (1 + F_A) term lifts");
line("  the half-sib figure from 12.500% to 15.625%.");

rule("2. RELATIONSHIP CLASSIFICATION AND PEDIGREE COMPLETENESS");
for (const [a, b] of [["P1","P2"],["P1","C1"],["C1","C2"],["GD","OUT_M"]] as const) {
  line(`  ${a} x ${b}`.padEnd(20) + classifyRelationship(herd, a, b).label);
}
line();
line(`  ancestry diversity P1 vs P2 (same parents) : ${(ancestryDiversity(herd, "P1", "P2") * 100).toFixed(0)}%`);
line(`  pedigree completeness of C1 over 4 gens    : ${(pedigreeCompleteness(herd, "C1") * 100).toFixed(0)}%`);
line();
line("  Completeness is reported beside every coefficient. F = 0% on a sparse");
line("  pedigree means 'not yet known', not 'safe to breed'.");

rule("3. MEDICATION WITHDRAWAL — the food-safety gate");
const dosed = new Date("2026-01-01T00:00:00Z");
const meds = [{ drugName: "Oxytetracycline", startDate: dosed, durationDays: 5, completedDate: null, withdrawalDays: 28 }];
for (const asOf of ["2026-01-20", "2026-02-01", "2026-02-02"]) {
  const s = computeWithdrawalStatus(meds, new Date(`${asOf}T00:00:00Z`));
  line(`  as of ${asOf}   saleable: ${s.inWithdrawal ? "NO " : "YES"}   ${s.inWithdrawal ? `${s.daysRemaining} days remaining` : "clear"}`);
}
line();
line("  A 5-day course from 1 Jan ends on the 5th, not the 6th. Plus 28 days of");
line("  withdrawal, the animal clears on 2 February. The check throws rather than");
line("  returning a boolean a caller could forget to read.");

rule("4. FIFO FEED ALLOCATION — traceability and refusal");
const batches = [
  { id: "b1", batchCode: "AUG-01", receivedDate: new Date("2026-02-01"), expirationDate: new Date("2026-12-01"), remainingKg: 30, costPerKgCents: 40_000 },
  { id: "b2", batchCode: "SEP-01", receivedDate: new Date("2026-03-01"), expirationDate: null, remainingKg: 80, costPerKgCents: 60_000 },
  { id: "b3", batchCode: "JUL-01", receivedDate: new Date("2026-01-01"), expirationDate: new Date("2026-04-01"), remainingKg: 500, costPerKgCents: 35_000 },
];
const asOf = new Date("2026-06-01");
const drawn = allocateFifo(batches, 70, { asOf });
line("  Request 70 kg on 1 June. JUL-01 is the oldest and largest, but it expired");
  line("  on 1 April, so it is skipped entirely. The draw spans the two usable");
  line("  deliveries, oldest first.");
for (const d of drawn.draws) line(`    ${d.batchCode}  ${String(d.kg).padStart(5)} kg   leaves ${d.remainingAfterKg} kg`);
line(`    weighted cost across the draw: ${(drawn.weightedCostPerKgCents / 100).toFixed(2)} per kg`);
line();
try {
  allocateFifo(batches, 5000, { asOf });
} catch (e) {
  line(`  Request 5000 kg -> refused: ${(e as FeedAllocationError).message}`);
}
line();
line("  It refuses rather than short-filling. A record for less than was actually");
line("  fed makes every downstream conversion ratio read better than reality.");

rule("5. BATCH METRICS — a flock of 500 broilers");
const events = [
  { eventType: "MORTALITY" as const, quantity: 9,  occurredAt: new Date("2026-08-22") },
  { eventType: "MORTALITY" as const, quantity: 6,  occurredAt: new Date("2026-09-05") },
  { eventType: "CULL"      as const, quantity: 3,  occurredAt: new Date("2026-09-12") },
];
const start = new Date("2026-08-19");
const alive = countFromEvents(500, events);
const m = mortalityStats(start, 500, events);
const { gainKg, fcr } = batchFcr({ feedKg: 1693, currentCount: alive, avgWeightKg: 2.25, initialCount: 500, startWeightKg: 0.04 });
line(`  alive            ${alive} of 500 stocked   (derived from the event log, not observed)`);
line(`  mortality        ${m.died} died, ${m.culled} culled -> ${((m.mortalityRate ?? 0) * 100).toFixed(1)}%`);
line(`  first week       ${m.firstWeekDeaths} of ${m.died} deaths`);
line(`  liveweight gain  ${gainKg.toFixed(1)} kg`);
line(`  feed conversion  ${fcr?.toFixed(2)} kg feed per kg gain`);
line();
line(`  no feed recorded -> ${batchFcr({ feedKg: 0, currentCount: alive, avgWeightKg: 2.25, initialCount: 500, startWeightKg: 0.04 }).fcr ?? "unknown (not 0.00)"}`);
line(`  lay rate 560 eggs / 100 birds / 7 days = ${((layPercentage(560, 100, 7) ?? 0) * 100).toFixed(1)}%`);
line(`  impossible count 140 eggs / 100 birds / 1 day capped at ${((layPercentage(140, 100, 1) ?? 0) * 100).toFixed(0)}%`);
line();
line("  Mortality divides by everything ever stocked, not survivors: dividing by");
line("  what is left makes the rate fall as more animals die.");

rule("END OF TRANSCRIPT");
line("Every animal above is fabricated in the generating script. No database was");
line("contacted and no real record was read.");
line();
