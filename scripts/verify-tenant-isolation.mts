/**
 * Proves tenant isolation, or says why it cannot.
 *
 * Worth having as a script rather than a unit test because the thing being
 * checked is a property of the live database and the role the app connects
 * as — not of any TypeScript. The policies can be perfect and still do
 * nothing if the connection role carries BYPASSRLS, which is exactly the
 * state this project was in when the policies were first written.
 *
 *   npm run verify:tenant
 */

import pg from "pg";
import { readFileSync } from "node:fs";

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = loadEnv();
const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

const role = await client.query(
  "select current_user, rolbypassrls from pg_roles where rolname = current_user"
);
const { current_user: user, rolbypassrls: bypasses } = role.rows[0];

console.log(`\nRuntime connection role: ${user}`);

if (bypasses) {
  console.log(`  ✗ ${user} has BYPASSRLS — every policy is ignored on this connection.`);
  console.log("    The policies exist and are correct, but they are not being enforced.");
  console.log("    Point DATABASE_URL at app_user to turn them on. See docs/rls-setup.md.\n");
  await client.end();
  process.exit(1);
}

console.log(`  ✓ ${user} cannot bypass row-level security.`);

const farms = await client.query('select id, name from "Farm" order by "createdAt" limit 2');

if (farms.rows.length === 0) {
  console.log("  ! No farms exist — nothing to isolate. Seed first.\n");
  await client.end();
  process.exit(1);
}

// 1. With no tenant established, the policies must return nothing. This is
//    the fail-closed property: a query that forgets its tenant leaks nothing.
const unscoped = await client.query('select count(*)::int n from "Animal"');
const unscopedOk = unscoped.rows[0].n === 0;
console.log(
  `  ${unscopedOk ? "✓" : "✗"} With no tenant set, Animal returns ${unscoped.rows[0].n} rows (expected 0)`
);

// 2. Inside a tenant, only that tenant's rows are visible.
await client.query("begin");
await client.query("select set_config('app.farm_id', $1, true)", [farms.rows[0].id]);
const scoped = await client.query(
  'select count(*)::int total, count(*) filter (where "farmId" <> $1)::int foreign_rows from "Animal"',
  [farms.rows[0].id]
);
await client.query("rollback");

const scopedOk = scoped.rows[0].foreign_rows === 0;
console.log(
  `  ${scopedOk ? "✓" : "✗"} Scoped to "${farms.rows[0].name}": ${scoped.rows[0].total} animals, ${scoped.rows[0].foreign_rows} belonging to other farms (expected 0)`
);

// 3. A write must not be able to plant a row in someone else's farm.
let writeBlocked = false;
await client.query("begin");
await client.query("select set_config('app.farm_id', $1, true)", [farms.rows[0].id]);
try {
  await client.query(
    'insert into "Species" (id, "farmId", name, code, "updatedAt") values ($1, $2, $3, $4, now())',
    ["rls-probe", farms.rows[1]?.id ?? "other-farm", "Probe", "PRB"]
  );
} catch {
  writeBlocked = true;
}
await client.query("rollback");
console.log(
  `  ${writeBlocked ? "✓" : "✗"} A write aimed at another farm was ${writeBlocked ? "refused" : "ACCEPTED — the WITH CHECK clause is not holding"}`
);

await client.end();

const allGood = unscopedOk && scopedOk && writeBlocked;
console.log(
  allGood
    ? "\nTenant isolation is enforced by the database.\n"
    : "\nIsolation is NOT fully enforced. Do not put a second farm's data in this database yet.\n"
);
process.exit(allGood ? 0 : 1);
