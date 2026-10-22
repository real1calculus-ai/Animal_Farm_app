# Deploying the live demo

The demo is the real application pointed at a throwaway database, not a
separate copy of the source. That matters: a second codebase with mock data
drifts from the real one within a fortnight, and publishing it would mean
publishing the source this product keeps private.

> **The one step a human has to get right.** Demo mode does not make the
> database safe; it only changes the interface. Point a demo deployment at
> your production database and you have published a working farm's records.
> **Use a separate Supabase project.** Nothing in the code can enforce this.

---

## 1. A separate database

Create a **second** Supabase project, used by nothing else.

Free tier pauses after about a week idle, which for a demo linked from a CV
means it is usually asleep exactly when someone looks. Either accept that, or
put the demo on a paid instance or a provider that does not pause.

Apply the schema and seed it:

```bash
DIRECT_URL="<demo direct url>" npx prisma migrate deploy
DIRECT_URL="<demo direct url>" DATABASE_URL="<demo pooled url>" npm run db:seed
```

## 2. The demo account

Demo mode shows an "Explore the demo" button that signs in as a fixed
account. Create it once, in the **demo** project only:

Supabase dashboard → Authentication → Users → **Add user**

- Email: `demo@animalfarm.app`
- Password: `explore-the-demo`
- Auto-confirm: **yes** (otherwise the first visitor hits an unconfirmed
  account and the demo looks broken)

Copy its user id, then attach it to the seeded farm:

```bash
NEXT_PUBLIC_DEMO_MODE=true DEMO_AUTH_USER_ID="<the uuid>" npm run db:seed
```

The password is deliberately public. It is printed on the sign-in page, and
the account holds nothing but invented animals. A demo that makes a recruiter
hunt for credentials in a README is a demo that gets closed.

## 3. Environment variables on the demo deployment

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_DEMO_MODE` | `true` |
| `NEXT_PUBLIC_DEMO_EMAIL` | `demo@animalfarm.app` |
| `NEXT_PUBLIC_DEMO_PASSWORD` | `explore-the-demo` |
| `DATABASE_URL` | demo project, pooled (6543), as `app_user` |
| `DIRECT_URL` | demo project, session pooler (5432), as `postgres` |
| `NEXT_PUBLIC_SUPABASE_URL` | demo project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | demo project |
| `SUPABASE_SERVICE_ROLE_KEY` | demo project |

`NEXT_PUBLIC_DEMO_MODE` is read at build time, so changing it needs a
redeploy, not just a save.

**Never set these on the production deployment.** Production has no demo
banner, no demo button, and no demo account.

## 4. Resetting

Visitors can write, which is the point: a demo where nothing can be entered
teaches nobody whether the software is pleasant to use. So it needs resetting.

```bash
npm run demo:reset
```

It refuses unless `NEXT_PUBLIC_DEMO_MODE` is `true`, so a mistyped URL in a
scheduler cannot wipe a real farm.

Schedule it daily. On Vercel, a cron hitting a route handler that shells to
the same seed, or an external scheduler running the command, both work.

## 5. What is blocked

Almost nothing. Visitors can add animals, record matings, log treatments and
feed, and run every report. That is the point.

Four actions are blocked because they would break the demo for the next
person rather than because they are dangerous: removing staff, changing staff
roles, deleting the farm, and changing the subscription. See
`DEMO_BLOCKED_ACTIONS` in `src/lib/demo.ts`.

## 6. Before sharing the link

- [ ] The URL is the demo deployment, not production
- [ ] The amber demo banner is visible on every page
- [ ] "Explore the demo" signs in without typing anything
- [ ] The dashboard shows the seeded herd and live alerts
- [ ] `npm run verify:tenant` passes against the demo database
- [ ] The reset job is scheduled and has run successfully at least once
