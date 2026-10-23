/**
 * Proves tenant isolation, or says why it cannot.
 *
 * Worth being a script rather than a unit test because the thing checked is a
 * property of the live database and of the role queries actually execute as —
 * not of any TypeScript. The policies can be perfect and do nothing if the
 * role carries BYPASSRLS, which is the state this project was in when they
 * were first written.
 *
 * Two layers, deliberately:
 *
 *   Part 1 drives raw SQL, to establish that the database itself enforces the
 *   policies under `app_user`.
 *
 *   Part 2 drives the app's own `prisma` proxy, because that is what every one
 *   of the 183 call sites uses. Part 1 can pass while Part 2 fails — it did
 *   during this very change, when the array form of `$transaction` turned out
 *   not to be scoped at all. Re-implementing the scoping here instead of
 *   importing it would have hidden exactly that.
 *
 *   npm run verify:tenant
 *
 * The --conditions=react-server flag is required: the proxy chain reaches
 * `server-only` modules, which throw under a plain Node resolve.
 */

import pg from "pg";
import { readFileSync } from "node:fs";
import { prisma, withTenant } from "@/lib/prisma";

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const RUNTIME_ROLE = process.env.APP_DB_ROLE ?? "app_user";

const results: { ok: boolean; line: string }[] = [];
const check = (ok: boolean, line: string) => {
  results.push({ ok, line });
  console.log(`  ${ok ? "✓" : "✗"} ${line}`);
};

const env = loadEnv();
const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

// ---------------------------------------------------------------------------
// Part 1 — the database
// ---------------------------------------------------------------------------

console.log("\nThe database");

const connectionRole = (await client.query("select current_user")).rows[0].current_user;

const runtime = await client.query(
  "select rolbypassrls, rolsuper from pg_roles where rolname = $1",
  [RUNTIME_ROLE]
);

if (runtime.rows.length === 0) {
  console.log(`  ✗ There is no "${RUNTIME_ROLE}" role. See docs/rls-setup.md.\n`);
  await client.end();
  process.exit(1);
}

check(
  !runtime.rows[0].rolbypassrls && !runtime.rows[0].rolsuper,
  `${RUNTIME_ROLE} can neither bypass row-level security nor act as superuser`
);

// The capability the whole arrangement rests on. Supabase's pooler refuses to
// authenticate a custom role, so the connection is made as the owner and each
// transaction drops to this one; if that switch is not permitted, every query
// silently runs with the policies bypassed.
let canSetRole = false;
await client.query("begin");
try {
  await client.query(`set local role ${RUNTIME_ROLE}`);
  canSetRole =
    (await client.query("select current_user")).rows[0].current_user === RUNTIME_ROLE;
} catch {
  canSetRole = false;
}
await client.query("rollback");

check(
  canSetRole,
  `${connectionRole} may drop into ${RUNTIME_ROLE} for a transaction` +
    (canSetRole ? "" : ` — run: GRANT ${RUNTIME_ROLE} TO ${connectionRole} WITH INHERIT FALSE, SET TRUE`)
);

check(
  (await client.query("select current_user")).rows[0].current_user === connectionRole,
  `the role reverts to ${connectionRole} when the transaction ends, so the pooled connection is not left altered`
);

const farms = await client.query('select id, name from "Farm" order by "createdAt" limit 2');
if (farms.rows.length === 0) {
  console.log("  ! No farms exist — nothing to isolate. Seed first.\n");
  await client.end();
  process.exit(1);
}
const [farm, otherFarm] = farms.rows;

/** Runs `fn` as the runtime role, optionally with a tenant, then rolls back. */
async function asRuntimeRole<T>(farmId: string | null, fn: () => Promise<T>): Promise<T> {
  await client.query("begin");
  try {
    await client.query(`set local role ${RUNTIME_ROLE}`);
    if (farmId !== null) {
      await client.query("select set_config('app.farm_id', $1, true)", [farmId]);
    }
    return await fn();
  } finally {
    await client.query("rollback");
  }
}

// Fail-closed: a query that forgets its tenant must leak nothing, not everything.
const unscoped = await asRuntimeRole(null, async () =>
  (await client.query('select count(*)::int n from "Animal"')).rows[0].n
);
check(unscoped === 0, `with no tenant set, Animal returns ${unscoped} rows (expected 0)`);

const scoped = await asRuntimeRole(farm.id, async () =>
  (
    await client.query(
      'select count(*)::int total, count(*) filter (where "farmId" <> $1)::int foreign_rows from "Animal"',
      [farm.id]
    )
  ).rows[0]
);
check(
  scoped.foreign_rows === 0,
  `scoped to "${farm.name}": ${scoped.total} animals, ${scoped.foreign_rows} from other farms (expected 0)`
);

const writeBlocked = await asRuntimeRole(farm.id, async () => {
  try {
    await client.query(
      'insert into "Species" (id, "farmId", name, code, "updatedAt") values ($1, $2, $3, $4, now())',
      ["rls-probe", otherFarm?.id ?? "other-farm", "Probe", "PRB"]
    );
    return false;
  } catch {
    return true;
  }
});
check(
  writeBlocked,
  writeBlocked
    ? "a write aimed at another farm was refused by the WITH CHECK clause"
    : "a write aimed at another farm was ACCEPTED — the WITH CHECK clause is not holding"
);

await client.end();

// ---------------------------------------------------------------------------
// Part 2 — the client the app actually uses
// ---------------------------------------------------------------------------

console.log("\nThe app's prisma proxy");

const proxyUnscoped = await prisma.animal.count();
check(
  proxyUnscoped === 0,
  `outside any farm scope, prisma.animal.count() returns ${proxyUnscoped} (expected 0)`
);

const proxyScoped = await withTenant(farm.id, async () => {
  const total = await prisma.animal.count();
  const foreign = await prisma.animal.count({ where: { NOT: { farmId: farm.id } } });
  return { total, foreign };
});
check(
  proxyScoped.foreign === 0 && proxyScoped.total > 0,
  `inside withTenant("${farm.name}"): ${proxyScoped.total} animals, ${proxyScoped.foreign} from other farms (expected some, and 0)`
);

// Interactive transactions take a different branch of the proxy, and it is the
// branch the 16 multi-write flows in this app depend on.
const inTransaction = await withTenant(farm.id, async () =>
  prisma.$transaction(async (tx) => {
    const who = await tx.$queryRaw<{ current_user: string }[]>`select current_user`;
    const animals = await tx.animal.count();
    return { role: who[0].current_user, animals };
  })
);
check(
  inTransaction.role === RUNTIME_ROLE && inTransaction.animals > 0,
  `inside prisma.$transaction the role is ${inTransaction.role} (expected ${RUNTIME_ROLE}) and ${inTransaction.animals} animals are visible`
);

const failures = results.filter((r) => !r.ok).length;
console.log(
  failures === 0
    ? "\nTenant isolation is enforced by the database, through the client the app uses.\n"
    : `\n${failures} check(s) failed. Do not put a second farm's data in this database yet.\n`
);
process.exit(failures === 0 ? 0 : 1);
