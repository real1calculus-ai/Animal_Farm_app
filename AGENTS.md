<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Pig Farm Management System — project conventions

Built from `docs/requirements.md`. Next.js 16 (App Router, Proxy not Middleware),
React 19, Prisma 6 + PostgreSQL on Supabase, Tailwind 4, Supabase Auth.

## Architecture

- **Server Components by default.** `"use client"` only for genuine
  interactivity (forms with local state, toggles, charts). Data is read in the
  Server Component and passed down.
- **Mutations are Server Actions** in a colocated `actions.ts` per route.
  Every action begins with `requireRole([...])` — actions are reachable by
  direct POST, so the nav hiding a button is not a permission check.
- Actions finish with `revalidatePath(...)` and, where the flow moves on,
  `redirect(...)`.
- **Query helpers live in `src/lib/db/<domain>.ts`**, not inline in pages, once
  a query is used by more than one screen.
- Everything is scoped by farm: `const farmId = await getActiveFarmId(user)`.
  Never query a farm-owned table without a `farmId` in the where clause.

## Data rules

- Money: integer minor units in `*Cents` columns. Format with `formatCents`,
  parse with `toCents`/`requireCents`. Never floats.
- Weights: floats, kilograms.
- Enum values reach the database only through `requireEnum`/`optionalEnum`
  against the label maps in `src/lib/labels.ts`.
- Enum display strings come from `src/lib/labels.ts` — never hand-written in a
  component.

## Domain facts that the requirements document gets wrong

- **Gestation is ~114 days, not 21.** The spec says farrowing is "~21 days
  after breeding"; 21 days is the *estrus* cycle. Use
  `FarmSettings.gestationDays` (default 114) and `estrusCycleDays` (21).
- Inbreeding is computed by `src/lib/breeding/inbreeding.ts` (kinship
  recursion, verified in `tests/inbreeding.test.ts`). Do not re-implement path
  counting anywhere else.

## UI

- Primitives in `src/components/ui/`: `Button`/`ButtonLink`, `Card`, `Input`/
  `Select`/`Textarea`/`Label`, `Field`, `Badge`, `Table`/`Thead`/`Tbody`/`Tr`/
  `Th`/`Td`, `StatTile`, `PageHeader`, `EmptyState`, `SubmitButton`, `Spinner`,
  `ToastProvider`.
- Use `SubmitButton` inside every `<form action={...}>` — it disables on submit,
  which is the only thing stopping a double-tap from writing twice.
- Every list screen renders `EmptyState` when it has no rows.
- Dark mode is supported throughout: pair every `bg-`/`text-` with its `dark:`
  variant, matching the existing primitives.
- Mobile matters — this is used one-handed in a barn. Tables scroll inside
  their own container; forms are single-column on small screens.

## Verifying

- `npm run typecheck` and `npm run lint` must both pass.
- `npm test` runs the domain tests (`tsx --test`).
- There is no database connection in development yet, so **do not run
  `prisma migrate`**. `prisma generate` and `prisma validate` work offline.
