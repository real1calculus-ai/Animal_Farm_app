# Animal Farm Management

Breeding, health, feed, financial and asset management for a mixed livestock
farm. Built from `docs/requirements.md`, which specified pigs; the model was
generalised to any species once the farm turned out to keep several.

## Species

Three tracking modes, because the differences are structural rather than
cosmetic:

| Mode | Animals | How it works |
| --- | --- | --- |
| **Individual** | pigs, goats, sheep, cattle | Named, pedigreed, weighed one at a time |
| **Batch** | broilers, layers, catfish, snails | Stocked, fed and sold as a group |
| **Hybrid** | rabbits, grasscutters | Breeders named, growers counted |

Each species carries its own biology — a goat gestates 150 days and *kids*,
a pig 114 and *farrows*, cattle score body condition 1–9 rather than 1–5 —
so those are rows in a `Species` table, editable without a deploy, rather
than constants.

Dogs are kept as `WORKING` rather than `LIVESTOCK`: they get health and
vaccination records, and are excluded from profitability, feed conversion
and the sale gate. A guard dog in a cost-per-kg-of-gain report is a bug.

Next.js 16 (App Router) · React 19 · Prisma 6 · PostgreSQL (Supabase) ·
Tailwind 4 · Supabase Auth.

## What makes this more than CRUD

- **Breeding intelligence.** Wright's coefficient of inbreeding computed
  through the kinship recursion, a ranked sire match-finder that refuses
  full-sib and parent–offspring pairings outright and explains every
  exclusion, and genetic-diversity monitoring across the whole herd.
- **Food-safety enforcement.** Medication withdrawal periods block an animal
  from being sold, rather than merely displaying a note.
- **Lot traceability.** Feed stock lives in batches drawn down first-in-first-out,
  so "which animals ate this delivery" is answerable after a recall.
- **Derived alerts.** Nothing is a stale flag in a table — alerts are computed
  from live data on every load, and only a user's dismissal is stored.
- **Batch integrity.** A flock's headcount is derived from an append-only
  event log, not observed — nobody counts 500 birds each morning. The cached
  count is reconciled against the log, and drift is surfaced rather than
  silently corrected.
- **Throttled auth.** Sign-in and password reset are rate-limited per account
  and per client, table-backed so it survives serverless cold starts, and the
  reset flow never reveals whether an address has an account.

## Setup

### 1. Create the Supabase project

1. At [supabase.com/dashboard](https://supabase.com/dashboard), create a new
   project and set a database password you keep.
2. **Project Settings → Database → Connection string → URI.** You need two
   forms of it:
   - the **pooled** connection (port `6543`, Transaction mode) → `DATABASE_URL`
   - the **direct** connection (port `5432`) → `DIRECT_URL`

   Both are required. Prisma Migrate cannot run through the pooler, and the app
   should not hold direct connections at runtime.
3. **Project Settings → API** for the project URL, the `anon` public key, and
   the `service_role` key.

### 2. Configure the environment

```bash
cp .env.example .env
```

Fill in all five values. `.env` is gitignored; `SUPABASE_SERVICE_ROLE_KEY`
bypasses row-level security, so it must never reach the browser or a commit.

### 3. Create the schema and seed a demo herd

```bash
npm install
npm run db:migrate
npm run db:seed
```

`db:seed` is idempotent — safe to re-run. It creates a farm with a multi-generation
pedigree, so the breeding match-finder has something real to rank.

### 4. Run it

```bash
npm run dev
```

The **first account to sign up becomes the farm Administrator** and is approved
automatically. Every later signup is created as an unapproved Worker and must be
approved by an Admin under **Staff** — otherwise anyone who found the URL could
grant themselves an account.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Domain tests (inbreeding maths, allocation logic) |
| `npm run db:migrate` | Create/apply a migration in development |
| `npm run db:deploy` | Apply migrations in production |
| `npm run db:seed` | Seed the demo herd |
| `npm run db:studio` | Prisma Studio |

## Roles

| Role | Can do |
| --- | --- |
| **Administrator** | Everything, including staff and farm settings |
| **Farm manager** | Everything operational, including financials |
| **Veterinarian** | Health and reproductive records; read-only elsewhere |
| **Farm worker** | Day-to-day data entry; no financials, no settings |

Roles are enforced in every Server Action via `requireRole()`, not just in the
navigation — Server Actions are reachable by direct POST.

## A note on the requirements document

`docs/requirements.md` states that farrowing follows breeding by about 21 days
(§3.1, §8.2). That is the length of the **estrus cycle**; sow **gestation** is
about 114 days. Farrowing projections use `FarmSettings.gestationDays`
(default 114), and the 21-day figure is kept separately as `estrusCycleDays`
for predicting the next heat. Both are configurable in Settings.

## Deploying

Vercel, with the same five environment variables set on the project. Run
`npm run db:deploy` against the production database as part of the release.
