# Offline-first: architecture, status, and what's still open

## Why this exists

The app is Server Components + Server Actions by default (see AGENTS.md) —
every screen renders from a live database round trip and every write goes
through a server-side check. That's the right default for a farm-management
app, but it means **zero functionality with no connection**: the native
shell's own offline handling (`capacitor.config.ts`'s `errorPath`, and
`src/components/native-shell.tsx`'s connectivity banner) only softens the
failure, it doesn't let anyone actually do anything.

True offline capability — creating and reading records with no signal at
all — needs a local database on the device and a sync layer to reconcile it
with Postgres. That's [PowerSync](https://www.powersync.com): a local
SQLite replica per device (via `wa-sqlite`/IndexedDB in the browser and the
Capacitor WebView alike), with a "sync rules" config on the server side
controlling what replicates to whom, and a client-side queue for writes made
offline.

**This is a per-domain migration, not a flag to flip.** Each screen that
needs to work offline has to be rebuilt as a client component reading from
the local SQLite database instead of a Server Component reading from
Postgres directly — the local database only exists in the browser/WebView,
so a Server Component (which renders on the server) can never see it. Health
records is the first slice; extending this to other domains means repeating
the pattern below for each one.

## What's built

- `src/lib/offline/schema.ts` — the local SQLite schema PowerSync
  replicates into the device: a read-only `animals` table (just what the
  picker needs), `health_records`, `medications`, and a local-only
  `sync_pending` table used purely for the "queued" UI badge.
- `src/lib/offline/connector.ts` — bridges the local database to this
  app's backend. `fetchCredentials` hands PowerSync the Supabase session
  token directly. `uploadData` does **not** write straight to Postgres the
  way PowerSync's own quickstarts usually do (typically via Supabase's
  client, relying entirely on RLS for authorization) — this app's
  validation and permission checks live in TypeScript
  (`src/app/health/actions.ts`), not in Postgres policies, so the queue
  drains through a real API route instead of bypassing that logic.
- `src/app/api/offline/sync/route.ts` — that route. Re-runs the same
  `requireRole`, farm-scoped lookups, and diagnosis normalisation the
  online path uses. IDs are **client-generated** (`crypto.randomUUID()` in
  the offline form) and stay the same on the server — the local row and
  the server row are the same row, not two reconciled after the fact.
- `src/app/health/offline/` — the first offline-capable screen. Trimmed
  relative to the online form at `src/app/health/new`: no medications
  sub-form, no "mark deceased" side effect, no editing or deleting an
  existing record offline. Those stay online-only for now.
- `powersync/sync-rules.yaml` — draft bucket definitions scoping
  replication by farm.

## What's verified vs. what isn't

Verified against the actually-installed packages (this sandbox can reach
npm but not `docs.powersync.com`, which is blocked by network policy):

- Current package versions (`@powersync/web@2.4.1`, `@powersync/react@2.0.1`)
- The `Schema`/`Table`/`column` API, the `PowerSyncBackendConnector`
  interface (`fetchCredentials`/`uploadData`), `getCrudBatch()`/`CrudEntry`
  shape, `PowerSyncDatabase` constructor, `usePowerSync`/`useQuery`/`useStatus`
  — all read directly from the shipped `.d.ts` files, not from memory
- The build compiles and typechecks clean against these APIs

**Not verified — no live PowerSync instance or Supabase database was
reachable from this sandbox to test against:**

- The exact `sync-rules.yaml` syntax. Written from training knowledge of
  PowerSync's sync-rules format; validate it in the PowerSync dashboard's
  sync rules editor (it lints on save) before deploying.
- **`request.jwt() ->> 'farm_id'` almost certainly does not work as
  written.** Supabase's default JWT only carries standard claims (`sub`,
  `email`, `role`, `aud`, ...) — `farm_id` is not one of them. This needs a
  custom claim added to the Supabase-issued JWT (a
  [Supabase Auth Hook](https://supabase.com/docs/guides/auth/auth-hooks)
  that adds `farm_id` from the Profile table is the standard way) before
  the sync rule actually scopes replication by farm. Until that's in
  place, treat the bucket definition as a template, not a working config.
- Whether PowerSync can validate a Supabase JWT directly (this doc assumes
  yes, based on documented Supabase-Auth integration support) or needs its
  own token-minting endpoint instead.
- End-to-end sync behavior, conflict handling, and the upload path's actual
  runtime behavior — all need a real PowerSync project connected to a real
  (ideally staging, not production) copy of this database.

## Setup still needed (yours — needs accounts/credentials this session doesn't have)

1. A PowerSync instance: [powersync.com](https://www.powersync.com) (hosted,
   generous free tier) or self-host the open-source sync service
   (`@powersync/service-module-postgres` is already the package that
   provides this).
2. Enable logical replication on the Supabase Postgres database and point
   the PowerSync instance at it (Supabase's own PowerSync integration guide
   covers the exact steps — again, unverified from this sandbox).
3. Add the `farm_id` custom JWT claim (see above) so `sync-rules.yaml`
   actually scopes correctly — without this, deploying the sync rules as
   written would replicate every farm's health records to every device,
   which is exactly the tenant leak the RLS work earlier in this project
   was about preventing. **Do not deploy sync rules to a shared PowerSync
   instance before this claim is in place.**
4. Set `NEXT_PUBLIC_POWERSYNC_URL` (the PowerSync instance's sync endpoint)
   in the environment.
5. Test against a real (non-production) database before trusting it with
   real farm data.

## Deliberately deferred

- Medications on the offline form
- Editing or deleting a health record offline
- The "mark deceased" side effect
- Every other domain (Animals, Feeding, Weight, Breeding, Finance, ...) —
  each is the same pattern (local table + API route + client screen)
  repeated for that domain's fields and validation rules
