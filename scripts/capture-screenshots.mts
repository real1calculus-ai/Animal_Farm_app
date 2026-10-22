/**
 * Captures the portfolio screenshots straight to disk.
 *
 * Every interesting route is behind sign-in, so this needs credentials. They
 * are read from the environment and never written anywhere: not to a file,
 * not to the repository, not to the shell history if you use the `read -s`
 * form below.
 *
 *   npx playwright install chromium        # once, ~120 MB
 *   npm run dev -- -p 3005                 # in another terminal
 *
 *   read -s -p "password: " FARM_PASSWORD && echo
 *   FARM_EMAIL=you@example.com FARM_PASSWORD="$FARM_PASSWORD" npm run capture
 *
 * Output: assets/notion_portfolio/*.png at 1440x900, device scale 2, so the
 * images are 2880 wide and stay sharp in Notion.
 */

import { chromium, type Page } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.FARM_BASE_URL ?? "http://localhost:3005";
const EMAIL = process.env.FARM_EMAIL;
const PASSWORD = process.env.FARM_PASSWORD;
const OUT = "assets/notion_portfolio";

if (!EMAIL || !PASSWORD) {
  console.error("Set FARM_EMAIL and FARM_PASSWORD. See the header of this file.");
  process.exit(1);
}

/** Full-page where the content is tall, viewport where framing matters. */
type Shot = {
  file: string;
  path: string;
  fullPage?: boolean;
  /** Runs after navigation: expand a section, pick a value, scroll. */
  prepare?: (page: Page) => Promise<void>;
};

async function main() {
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  const page = await context.newPage();

  // --- Sign in ---------------------------------------------------------
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByLabel(/email/i).fill(EMAIL!);
  await page.getByLabel(/password/i).fill(PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
  console.log("signed in");

  // The match finder and pedigree need real ids, so they are discovered
  // rather than hard-coded: seed ids change every time the demo is rebuilt.
  await page.goto(`${BASE}/breeding/match-finder`, { waitUntil: "networkidle" });
  const damId = await page
    .locator('select option:has-text("G1A-02")')
    .first()
    .getAttribute("value");

  await page.goto(`${BASE}/animals`, { waitUntil: "networkidle" });
  const animalHref = await page
    .locator('a[href^="/animals/"]')
    .filter({ hasText: /G2A-02|G2A-01|G1A-02/ })
    .first()
    .getAttribute("href");
  const animalId = animalHref?.split("/")[2];

  await page.goto(`${BASE}/batches`, { waitUntil: "networkidle" });
  const batchHref = await page.locator('a[href^="/batches/"]').first().getAttribute("href");
  const batchId = batchHref?.split("/")[2];

  const shots: Shot[] = [
    {
      file: "01-match-finder-exclusions.png",
      path: `/breeding/match-finder?damId=${damId}`,
      fullPage: true,
      prepare: async (p) => {
        // The exclusions live in a collapsed <details>; open it so the
        // refusal reasons are in the image.
        const toggle = p.locator("summary", { hasText: /Excluded/i }).first();
        if (await toggle.count()) await toggle.click();
        await p.waitForTimeout(400);
      },
    },
    { file: "02-match-finder-scoring.png", path: `/breeding/match-finder?damId=${damId}` },
    { file: "03-animal-pedigree.png", path: `/animals/${animalId}/pedigree`, fullPage: true },
    { file: "04-dashboard.png", path: "/", fullPage: true },
    { file: "05-genetics-report.png", path: "/reports/genetics", fullPage: true },
    { file: "06-batch-detail.png", path: `/batches/${batchId}`, fullPage: true },
  ];

  for (const shot of shots) {
    await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle" });
    if (shot.prepare) await shot.prepare(page);
    await page.screenshot({ path: `${OUT}/${shot.file}`, fullPage: shot.fullPage ?? false });
    console.log(`  ${shot.file}`);
  }

  // Mobile, because that is how the application is actually used.
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    colorScheme: "dark",
    storageState: await context.storageState(),
  });
  const phonePage = await phone.newPage();
  await phonePage.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await phonePage.screenshot({ path: `${OUT}/07-dashboard-mobile.png`, fullPage: false });
  console.log("  07-dashboard-mobile.png");

  await browser.close();
  console.log(`\nDone. ${shots.length + 1} images in ${OUT}/`);
}

main().catch((error) => {
  console.error("Capture failed:", error.message);
  process.exit(1);
});
