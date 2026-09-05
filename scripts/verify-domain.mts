/**
 * Exercises the domain engines against whatever is actually in the database.
 *
 * The unit tests pin the maths on synthetic pedigrees; this proves the queries
 * behind them work against real Postgres, which typechecking cannot. It is how
 * the feed-drop false positive was caught: the seed feeds every pen an
 * identical ration daily, so any "intake down" alert was by construction wrong.
 *
 *   npm run verify
 *
 * The --conditions=react-server flag is required: several modules are
 * `server-only`, which throws under a plain Node resolve.
 */

import { prisma } from "@/lib/prisma";
import { getFarmSettings } from "@/lib/active-farm";
import { findMatchesForDam } from "@/lib/breeding/match-finder";
import { breedingAlerts } from "@/lib/alerts/breeding";
import { healthAlerts } from "@/lib/alerts/health";
import { feedAlerts } from "@/lib/alerts/feed";
import { geneticsAlerts } from "@/lib/alerts/genetics";
import { housingAlerts } from "@/lib/alerts/housing";
import { sortAlerts } from "@/lib/alerts/types";
import { loadPedigreeIndex } from "@/lib/breeding/pedigree";
import { createInbreedingCalculator } from "@/lib/breeding/inbreeding";

async function main() {
  const farm = await prisma.farm.findFirstOrThrow();
  const settings = await getFarmSettings(farm.id);
  console.log(`FARM: ${farm.name}`);

  const dam = await prisma.pig.findFirstOrThrow({
    where: { farmId: farm.id, sex: "FEMALE", status: "ACTIVE", motherId: { not: null } },
    select: { id: true, tagNumber: true },
  });

  const result = await findMatchesForDam(farm.id, dam.id, settings);
  console.log(`\nMATCH FINDER for dam ${result.dam.tagNumber}`);
  console.log(`  her F=${(result.dam.inbreedingCoefficient * 100).toFixed(2)}%  pedigree ${(result.dam.pedigreeCompleteness * 100).toFixed(0)}% known`);
  console.log(`  eligible ${result.matches.length} / excluded ${result.excluded.length}`);
  for (const m of result.matches) {
    console.log(`   OK  ${m.tagNumber.padEnd(8)} score ${String(m.score).padStart(5)}  F=${(m.inbreedingCoefficient * 100).toFixed(2)}%  ${m.explanation}`);
  }
  for (const m of result.excluded) {
    console.log(`   NO  ${m.tagNumber.padEnd(8)} ${m.blockers.join("; ")}`);
  }

  const index = await loadPedigreeIndex(farm.id);
  const calc = createInbreedingCalculator(index);
  const a = await prisma.pig.findFirst({ where: { farmId: farm.id, tagNumber: "G1A-02" }, select: { id: true } });
  const b = await prisma.pig.findFirst({ where: { farmId: farm.id, tagNumber: "G1B-01" }, select: { id: true } });
  if (a && b) {
    const f = calc.offspringInbreeding(b.id, a.id);
    console.log(`\nHALF-SIB CHECK  G1B-01 x G1A-02 (both by sire B-001)`);
    console.log(`  offspring F = ${(f * 100).toFixed(2)}%  expected 12.50%  ${Math.abs(f - 0.125) < 1e-9 ? "OK" : "MISMATCH"}`);
  }

  const now = new Date();
  const alerts = sortAlerts([
    ...(await breedingAlerts(farm.id, settings, now)),
    ...(await healthAlerts(farm.id, settings, now)),
    ...(await feedAlerts(farm.id, now)),
    ...(await geneticsAlerts(farm.id, settings, now)),
    ...(await housingAlerts(farm.id, now)),
  ]);
  console.log(`\nALERTS: ${alerts.length}`);
  for (const alert of alerts.slice(0, 14)) {
    console.log(`  [${alert.severity.padEnd(8)}] ${alert.title}: ${alert.detail.slice(0, 92)}`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("FAILED:", e);
  await prisma.$disconnect();
  process.exit(1);
});
