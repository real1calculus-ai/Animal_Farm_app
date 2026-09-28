import type { Metadata } from "next";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Privacy Policy — Pig Farm Manager",
};

const LAST_UPDATED = "2026-09-28";

/**
 * Public route (see `isPublicPath` in src/proxy.ts) — both app stores
 * require a live privacy-policy link reachable without signing in.
 *
 * Drafted from the actual schema (prisma/schema.prisma), not a generic
 * template: every data category named below is a real table. The bracketed
 * placeholders are the only parts that need filling in before this is
 * legally binding — everything else already reflects what the app does.
 */
export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl py-4">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Privacy Policy
      </h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Last updated {LAST_UPDATED}</p>

      <Card className="mt-6 space-y-6 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
        <section>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Who this covers</h2>
          <p className="mt-2">
            This policy covers Pig Farm Manager (&ldquo;the app&rdquo;), operated by{" "}
            <strong>[Your Company / Legal Name]</strong> (&ldquo;we&rdquo;, &ldquo;us&rdquo;). It applies
            to every farm account created in the app, on the web and through the iOS and Android apps.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">What we collect</h2>
          <p className="mt-2">The app is multi-tenant: every record below belongs to one farm and is never visible to another farm.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><strong>Account data</strong> — your name, email address, and role (Admin, Manager, Veterinarian, or Worker) on your farm.</li>
            <li><strong>Farm and livestock records</strong> — animals, pens, batches, breeding, health, and vaccination history you or your team enter.</li>
            <li><strong>Financial records</strong> — transactions, sales, and supplier data you enter for your own farm&rsquo;s bookkeeping.</li>
            <li><strong>Invite data</strong> — the email address of anyone you invite to join your farm, and a hashed (not plaintext) copy of the invite token.</li>
            <li><strong>Sign-in security data</strong> — hashed counters of login attempts, used only to slow down password-guessing; never your actual password or a readable email.</li>
            <li><strong>Audit trail</strong> — a record of who changed what on your farm, so any account holder can see the history of their own data.</li>
            <li><strong>Device data for push notifications</strong> — a device token, only if you enable alerts (health reminders, vaccination due dates).</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">What we don&rsquo;t do</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>We don&rsquo;t sell your data, your farm&rsquo;s data, or your team&rsquo;s data to anyone.</li>
            <li>We don&rsquo;t use your farm records for advertising, and there are no third-party ad or tracking SDKs in the app.</li>
            <li>We don&rsquo;t share one farm&rsquo;s data with another — the app enforces this at the database level (row-level security), not only in the interface.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Where data is stored</h2>
          <p className="mt-2">
            Data is hosted on Supabase (PostgreSQL) and, for the app&rsquo;s infrastructure, [Vercel /
            your hosting provider]. These are our subprocessors: they store data on our behalf and are
            contractually bound not to use it for their own purposes.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Your rights</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>You can review and correct your account details at any time from Settings.</li>
            <li>You can delete your own account and personal data from the app itself, in Settings — see &ldquo;Account deletion&rdquo; below.</li>
            <li>If you administer a farm, you can export or delete your farm&rsquo;s records by contacting us at [support email].</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Account deletion</h2>
          <p className="mt-2">
            Deleting your account from Settings removes your profile, your login credentials, and your
            personal identifying information. Farm business records you contributed (health entries,
            transactions, etc.) stay attached to your farm&rsquo;s history, the way a paper logbook would,
            unless you are the farm&rsquo;s only member — in that case deleting your account deletes the
            whole farm and everything in it.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Contact</h2>
          <p className="mt-2">
            Questions about this policy or your data: <strong>[support email]</strong>.
          </p>
        </section>
      </Card>
    </div>
  );
}
