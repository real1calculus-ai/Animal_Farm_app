# Screenshot capture guide

Automated capture was not possible. Every route except `/login`, `/signup` and
`/forgot-password` redirects to sign-in, and driving a login means handling a
password, which the build process here does not do. Playwright would hit the
same wall, so installing it was not worth the download.

The dev server is the thing to capture from:

```bash
npm run dev -- -p 3005
```

Sign in, then capture at **1440 x 900**, dark mode (the default), with the
seeded demo farm loaded (`npm run db:seed`). The demo data is safe to publish;
it contains no real animals, people or figures.

## Captured (save from the conversation with these exact names)

| File | What it shows |
| --- | --- |
| `01-match-finder-exclusions.png` | Excluded boars table plus the workload penalty and override gate |
| `02-match-finder-scoring.png` | Dam card and the weighted score breakdown for the top match |
| `03-animal-pedigree.png` | Four-generation tree with the completeness caveat |
| `04-dashboard.png` | Sixteen live alerts at 1440x900 |

## Still to capture, in priority order

### 1. `01-match-finder.png` — the headline feature
**Route:** `/breeding/match-finder`, with a dam selected (try tag `G1A-02`)

Show the ranked sires with their score-breakdown bars, and expand the
**Excluded** section so the refusal reasons are visible. That contrast is the
whole story: three eligible boars scored and explained, four refused with
reasons like "Full siblings" and "Inbreeding coefficient 25.0% exceeds the
farm limit of 10.0%".

**Caption:** Ranked breeding recommendations with every exclusion explained.
Genetic distance, bloodline diversity, phenotype and health history are
weighted and shown, so a refusal can be argued with rather than merely obeyed.

### 2. `02-animal-pedigree.png` — the domain depth
**Route:** `/animals/<id>/pedigree` for a third-generation animal (`G2A-01`)

Show four generations, colour-coded by each animal's own inbreeding band, with
the dashed placeholders where ancestry is unrecorded.

**Caption:** Four-generation pedigree. Unknown ancestors render as visible
gaps, because the shape of what is missing is itself the finding when judging
whether a pedigree is complete enough to breed on.

### 3. `03-dashboard.png` — the daily surface
**Route:** `/`

Show the alert panel at the top with several live alerts of different
severities, then the herd composition and feed stock panels below.

**Caption:** The morning screen. Alerts are computed from live data on every
load rather than stored, so they cannot go stale, and each one names its
subject rather than saying something vague.

## Worth adding if there is room

| File | Route | Why |
| --- | --- | --- |
| `04-batch-detail.png` | `/batches/<id>` | Flock tracking: derived headcount, mortality curve, feed conversion |
| `05-genetics-report.png` | `/reports/genetics` | Inbreeding distribution and founder over-representation |
| `06-health-withdrawal.png` | `/health/<id>` | The medication withdrawal banner that blocks a sale |
| `07-mobile-dashboard.png` | `/` at 390 x 844 | Evidence it works one-handed, which is how it is actually used |
