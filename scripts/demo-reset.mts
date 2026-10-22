/**
 * Resets the demo farm to its seeded state.
 *
 * Intended for a scheduled job so visitors always arrive at a sane farm
 * rather than whatever the last person left behind.
 *
 *   npm run demo:reset
 *
 * Refuses unless NEXT_PUBLIC_DEMO_MODE is "true". That guard is the whole
 * point: this script deletes a farm's records, and the way it causes real
 * damage is being pointed at a production URL by a mistyped environment
 * variable in a scheduler. A flag that production never sets makes that
 * impossible rather than unlikely.
 */

import { execFileSync } from "node:child_process";

if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
  console.error(
    "Refusing to run: NEXT_PUBLIC_DEMO_MODE is not \"true\".\n" +
      "This script deletes farm records. It only runs against a demo deployment."
  );
  process.exit(1);
}

const url = process.env.DIRECT_URL ?? "";
if (!url) {
  console.error("DIRECT_URL is not set.");
  process.exit(1);
}

console.log("Demo mode confirmed. Rebuilding the demo farm...");

execFileSync("npx", ["tsx", "prisma/seed.ts"], {
  stdio: "inherit",
  env: { ...process.env, RESEED: "1" },
});

console.log("Demo farm reset.");
