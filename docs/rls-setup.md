# Turning on row-level security

The policies are written and applied. They are **not being enforced yet**,
because of one thing that is easy to miss and makes the whole exercise
worthless if you do:

> Supabase's `postgres` role carries `BYPASSRLS`. Connecting as it ignores
> every policy on every table. `npm run verify:tenant` reports this rather
> than letting you believe otherwise.

Two steps, both yours — the first needs a password, which I don't handle.

---

## 1. Give `app_user` a password

The role exists already (created by migration `20260927160000_app_role_for_rls`)
with `NOBYPASSRLS` and permission to run DML and nothing else. It has no
password, so it cannot log in yet.

In the **Supabase SQL editor**:

```sql
ALTER ROLE app_user WITH LOGIN PASSWORD 'generate-a-long-random-one';
```

Use something long and alphanumeric. If it contains `@ & : / ? #` you will
have to percent-encode it into the URL, and that is an avoidable irritation.

## 2. Point the runtime at it

In `.env`, `DATABASE_URL` becomes `app_user` and **`DIRECT_URL` stays
`postgres`**:

```
DATABASE_URL="postgresql://app_user.<project-ref>:<password>@aws-1-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.<project-ref>:<password>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"
```

That split is deliberate. `app_user` cannot run DDL, so migrations must keep
going through `postgres`; the runtime must *not*, or the policies do nothing.

Set the same split in Vercel when you deploy.

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
