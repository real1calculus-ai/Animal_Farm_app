/**
 * Reports what the database actually says, rather than what Prisma infers.
 *
 * Prisma collapses every pre-query failure into P1001 "Can't reach database
 * server", including a plain wrong password. That sends you diagnosing
 * networking, DNS and firewalls for a problem that is one line in .env. This
 * connects with the raw driver and prints the real SQLSTATE.
 *
 *   npm run db:check
 */

import { readFileSync } from "node:fs";
import { createConnection } from "node:net";
import pg from "pg";

function loadEnv() {
  const env = {};
  for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const HINTS = {
  "28P01":
    "Wrong database password. Reset it in Supabase (Settings → Database → Reset\n" +
    "  database password), then re-run: python3 scripts/setup-env.py",
  "3D000": "The database name in the URL does not exist.",
  "28000": "The username is wrong. Supabase poolers expect postgres.<project-ref>.",
  "53300": "Too many connections — the pooler is saturated.",
  ENOTFOUND: "Host does not resolve. Check the region in the hostname.",
  ETIMEDOUT: "Port unreachable — a firewall or the wrong port.",
};

function tcpCheck(host, port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port, timeout: 8000 });
    socket.on("connect", () => (socket.destroy(), resolve(true)));
    socket.on("error", () => resolve(false));
    socket.on("timeout", () => (socket.destroy(), resolve(false)));
  });
}

async function check(label, url) {
  if (!url) return console.log(`\n${label}: not set in .env`);

  const { hostname, port } = new URL(url);
  console.log(`\n${label} — ${hostname}:${port}`);
  console.log(`  tcp reachable: ${(await tcpCheck(hostname, Number(port))) ? "yes" : "no"}`);

  const client = new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  try {
    await client.connect();
    const { rows } = await client.query(
      "select current_user, current_database(), (select count(*) from information_schema.tables where table_schema = 'public') as tables"
    );
    console.log(`  connected as ${rows[0].current_user} / ${rows[0].current_database}`);
    console.log(`  tables in public schema: ${rows[0].tables}`);
    await client.end();
    return true;
  } catch (error) {
    const code = error.code ?? "unknown";
    console.log(`  FAILED [${code}] ${error.message}`);
    if (HINTS[code]) console.log(`  → ${HINTS[code]}`);
    return false;
  }
}

const env = loadEnv();
const pooled = await check("DATABASE_URL  (pooled, app runtime)", env.DATABASE_URL);
const direct = await check("DIRECT_URL    (session, migrations)", env.DIRECT_URL);

console.log(
  pooled && direct
    ? "\nBoth connections are good — migrations can run.\n"
    : "\nFix the failures above, then re-run: npm run db:check\n"
);
process.exit(pooled && direct ? 0 : 1);
