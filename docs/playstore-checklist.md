# Play Store readiness checklist

Status as of the multi-species build. Tick nothing on trust — each item says
how to verify it.

> **Policy drift warning.** Play Console requirements change several times a
> year, and some items below (billing, data safety, target API level) are the
> ones Google changes most often. Verify each against the current Play Console
> before you rely on this list.

---

## 0. The decision that shapes everything else

This is a Next.js web app. There are three ways onto Play, and they are not
equally sensible here:

| Route | What it is | Verdict |
| --- | --- | --- |
| **TWA** (Trusted Web Activity) | Android shell around the live site, via Bubblewrap | **Recommended.** No second codebase. |
| **Capacitor** | WebView plus native plugin bridge | Only if you need camera, GPS or push beyond what the web gives. |
| **React Native / Flutter rewrite** | A second app | Not justified. You would maintain two products. |

A TWA is a real Play listing, not a bookmark — but it is **only as good as the
PWA underneath it**, which is why most of this list is PWA work.

---

## 1. Make it an installable PWA — *blocking, not started*

- [ ] **Web app manifest** (`src/app/manifest.ts`) with `name`, `short_name`,
      `start_url`, `display: "standalone"`, `background_color`,
      `theme_color`, and icons at **192px and 512px**, plus a **maskable**
      icon. Missing any of these and Chrome will not treat it as installable.
- [ ] **Service worker** registered and serving at least an offline fallback.
      Play's TWA validator checks for one.
- [ ] **HTTPS** on a stable custom domain. A `*.vercel.app` preview URL will
      work technically but ties your Android app's identity to a hostname you
      do not own.
- [ ] **Lighthouse PWA audit passes** — run it against production, not localhost.
- [ ] **Icons and splash** at every density Bubblewrap asks for.

## 2. Offline — *the item most likely to decide whether farmers keep using it*

Not strictly required by Play. Required by the users described.

- [ ] Decide what must work with no signal. Recording a death, a weight, a
      feeding and an egg count are the daily jobs; reports can stay online-only.
- [ ] Queue writes locally (IndexedDB) and sync on reconnect.
- [ ] Show sync state honestly — "saved on this phone, not yet sent" is a
      different thing from "saved", and conflating them loses data silently.
- [ ] Handle the conflict case: two phones editing the same batch offline.

> Every page in this app is currently server-rendered. With no network there
> is no app at all. **There is a working precedent in your own inventory app**
> (`src/lib/offline/db.ts`, `sync.ts`) — the pattern is proven and portable.

## 3. Multi-tenancy — *blocking for SaaS, partially done*

- [x] **Tenant key on every table.** `farmId` is on every top-level entity,
      deliberately from the first migration.
- [ ] **Signup creates a new farm.** Today the *first* user creates a farm and
      **every later signup joins it**. For a SaaS that means farmer B lands
      inside farmer A's herd. This is the single most important fix on this
      list.
- [ ] **Invite flow** so a farm owner adds their own staff, separately from
      strangers signing up.
- [ ] **Row-level security.** 0 of 34 tables have RLS. Isolation is enforced
      only in application code, so one forgotten `farmId` in one `where`
      clause leaks another farm's business data. Acceptable for a single farm;
      not acceptable when the farms are strangers to each other.
- [ ] **Per-tenant tests** — create two farms, assert neither can read the
      other through any route.

## 4. Billing — *deferred: launching free on both stores*

Free at launch, pricing once there is a farmer base. This is the right order:
shipping free removes every store-billing policy question from the first
review, and adding paid tiers later is far easier than converting a paid app
to free. Nothing in this section blocks launch — it is what to work through
before charging.

- [x] **Launch free.** No in-app purchases means no Play or Apple billing
      rules apply at review time, on either store.
- [ ] When pricing arrives, keep checkout **on the web**. Both stores permit
      an account bought elsewhere being used in the app; what they forbid is
      selling or linking to the sale from inside it. Do not put a price, a
      "Subscribe" button or an upgrade link in either app.

- [ ] **Before charging, confirm whether Google Play Billing is mandatory.** Play
      generally requires it for digital services consumed inside the app, at
      **15% of the first $1M/year**. On a deliberately low price point for
      low-income farmers, that cut plus payment fees may be most of the margin.
- [ ] Check whether any current exemption or alternative-billing programme
      applies in Nigeria. This has changed repeatedly under regulatory
      pressure; do not assume last year's answer.
- [ ] If Play Billing is required, model the price *after* the cut.
- [ ] Consider whether web signup (Paystack/Flutterwave, no Play cut) with the
      app as a client is viable — Play restricts *steering users to it from
      inside the app*, which is the part that trips people up.
- [ ] Free tier / trial: decide what an unpaid farm can still do. Locking out
      an unpaid farm from *reading its own animal records* is a support
      nightmare and arguably unethical for records they depend on.

## 5. Play Console requirements

- [ ] Developer account — **$25 one-time**.
- [ ] **Identity verification** (D-U-N-S for organisations). Can take days;
      start it early, it is the most common surprise delay.
- [ ] **Signed AAB** (not APK), correct `targetSdk` for the current Play
      deadline.
- [ ] **Digital Asset Links** — `/.well-known/assetlinks.json` served from
      your domain, matching the app's signing key. Get this wrong and the TWA
      shows a browser address bar instead of running full-screen.
- [ ] Store listing: title, short and full description, **at least 2
      screenshots per form factor**, 512×512 icon, 1024×500 feature graphic.
- [ ] **Privacy policy at a public URL.** Mandatory. You collect emails,
      names, and farm business data.
- [ ] **Data safety form** — declare what you collect, why, whether it is
      shared, and whether it is encrypted in transit. Must match reality; this
      is audited.
- [ ] **Content rating** questionnaire.
- [ ] Target audience declaration (not child-directed).
- [ ] Account deletion: Play requires an in-app route **and** a public web URL
      to request deletion of an account and its data.

## 6. Testing track before production

- [ ] **Internal testing** — up to 100 testers, available almost immediately.
- [ ] **Closed testing** — Google currently requires personal developer
      accounts to run a closed test with a minimum number of testers for a
      sustained period before production access. Verify the current numbers;
      this rule has caught many small publishers out and adds weeks.
- [ ] Test on a genuinely low-end Android device on a throttled connection,
      not a flagship on wifi. That is the target user's hardware.

## 7. Before any real farm's data is in it

- [ ] Backups verified by an actual restore, not by the dashboard saying
      "enabled".
- [ ] Supabase off the free tier. **It has already paused twice in three
      weeks**; a paused database is a dead app, and it pauses on idleness
      regardless of paying customers.
- [ ] Error monitoring.
- [ ] A staging database separate from production.
- [ ] Rotate every credential that has been shared in a chat or a screenshot.
