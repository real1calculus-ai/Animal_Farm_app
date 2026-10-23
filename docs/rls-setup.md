# Turning on row-level security

The policies are applied **and enforced**. `npm run verify:tenant` proves it,
and proves it through the client the app actually uses rather than a
re-implementation of the scoping.

This took one non-obvious turn, recorded here because it looks wrong at a
glance and someone will otherwise "fix" it.

---

## The connection role is `postgres`, on purpose

The intended design was a dedicated `app_user` with `NOBYPASSRLS` in
`DATABASE_URL`. That cannot work on Supabase:

- **The pooler will not authenticate a custom role.** Supavisor holds
  credentials for the users it knows about — in practice `postgres`. A
  connection as `app_user` is refused with `28P01 password authentication
  failed` no matter how recently the password was set, and it fails on the
  session pooler (5432) as well as the transaction pooler (6543), so it is not
  the usual credential lag. Setting the password again from inside the database
  and immediately connecting still fails, which is what rules out a typo.
- **`options=-c role=app_user` is silently discarded.** The connection
  succeeds and `current_user` comes back as `postgres`. No error, nothing in
  the logs.
- **The direct host would accept either.** `db.<ref>.supabase.co` is IPv6-only
  without the paid IPv4 add-on.

So the connection is made as `postgres`, which carries `BYPASSRLS`, and
`src/lib/tenant.ts` drops each transaction to `app_user`:

```
SET LOCAL ROLE app_user;
SELECT set_config('app.farm_id', $1, true);
```

`SET LOCAL` is transaction-scoped, so the role reverts on commit and the
connection returns to the pool unchanged — which matters under transaction
pooling, where the next request gets the same backend.

Both halves of the proxy in `src/lib/prisma.ts` do this: the scoped path via
`applyFarmScope`, and the **unscoped** path via `applyRuntimeRole`. The
unscoped path is not optional. Sign-in, signup and auth throttling run before
any farm is known, and if those ran as `postgres` they would see every farm on
the platform instead of none.

`basePrisma` skips the proxy and therefore keeps `BYPASSRLS`. Nothing in
`src/` imports it. `scripts/verify-domain.mts` does, to choose which tenant to
inspect — which cannot be done from inside a tenant.

### What this required once

`postgres` held `ADMIN` on `app_user` but not `SET`, which PostgreSQL 16 split
apart, so `SET ROLE app_user` failed with `42501 permission denied to set
role`. Fixed with:

```sql
GRANT app_user TO postgres WITH INHERIT FALSE, SET TRUE;
```

`INHERIT FALSE` is deliberate: `postgres` must be able to *become* the weaker
role on purpose, not pick its privileges up implicitly. This is a
de-escalation capability — `postgres` already owns the database — and
`verify:tenant` asserts it, printing the exact `GRANT` if it is missing.

`app_user` needs no password under this arrangement. `SET ROLE` requires
membership, not authentication.

### One policy that does not fail closed

`Profile` reads:

```sql
("farmId" IS NULL) OR ("farmId" = current_farm_id()) OR (current_farm_id() IS NULL)
```

That third clause makes every profile on the platform visible when no tenant
is set, so sign-in can find an account before the farm is known. Harmless with
one farm; with many it exposes names, emails and roles to any query that
forgets its scope. Worth narrowing to a self-read on `id` before a second real
tenant exists.

---

## 3. Check it

```bash
npm run verify:tenant
```

It asserts three things, and reports which one failed:

1. With no tenant established, tenant tables return **zero rows** — the
   fail-closed property. A query that forgets its tenant leaks nothing rather
   than everything.
2. Inside a tenant scope, no row from another farm is visible.
3. A write aimed at another farm's `farmId` is refused by the `WITH CHECK`
   clause.

---

## Switching the role is now safe

Steps 1 and 2 will no longer break the app: the scope is established on every
request, so queries carry their tenant. Before flipping, run
`npm run verify:tenant` — it exits non-zero and says why if anything is off.

## How the tenant reaches the query

The policies compare against `current_farm_id()`, which reads a
**transaction-local** setting. Transaction-local, not per-connection: the app
runs serverless behind a pooler, so connections are shared between requests,
and a per-connection setting would leak from one farm to the next — the exact
failure this is built to prevent.

`withTenant(farmId, fn)` in `src/lib/tenant.ts` opens a transaction, sets the
value, and puts the transaction client in AsyncLocalStorage. The `prisma`
export is a proxy that forwards to it when a scope is active, so call sites
stay ordinary — `prisma.animal.findMany(...)` lands on the scoped client
without threading a parameter through several hundred places.

**Wiring: done.** `getActiveFarmId()` calls `enterFarmScope()`, and it
already runs before every farm-scoped query in the app — so the scope is
established in one place rather than by a wrapper around 183 call sites that
someone would eventually leave off. The `prisma` export is a proxy: with a
scope active it runs each operation inside a transaction that sets
`app.farm_id` first, and it hooks `$transaction` so the 16 interactive
transactions set the tenant once for the whole block.

Verified against the live database: unset outside a scope, matching the farm
id inside both a transaction and a plain model call.

The cost, stated plainly: a scoped query is two round trips rather than one,
because the setting and the query have to share a transaction. Group related
work in `prisma.$transaction(...)` where that matters.
