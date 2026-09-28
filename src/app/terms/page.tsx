import type { Metadata } from "next";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Terms of Service — Pig Farm Manager",
};

const LAST_UPDATED = "2026-09-28";

/** Public route (see `isPublicPath` in src/proxy.ts) — same reasoning as /privacy. */
export default function TermsOfServicePage() {
  return (
    <div className="mx-auto max-w-3xl py-4">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Terms of Service
      </h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Last updated {LAST_UPDATED}</p>

      <Card className="mt-6 space-y-6 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
        <section>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Agreement</h2>
          <p className="mt-2">
            These terms govern your use of Pig Farm Manager, provided by{" "}
            <strong>[Your Company / Legal Name]</strong>. Creating an account means you agree to them.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Farm accounts and roles</h2>
          <p className="mt-2">
            An account belongs to one farm. The first person to sign up for a farm becomes its Admin and
            approves everyone who joins afterward. Admins and Managers can assign roles (Veterinarian,
            Worker) that control what each teammate can see and change — financial data, health records,
            and breeding decisions are gated by role inside the app.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Your data, your farm</h2>
          <p className="mt-2">
            Everything you record — animals, breeding history, health records, feed, finances — belongs
            to your farm. We don&rsquo;t claim ownership of it, and we don&rsquo;t share it with any other
            farm on the platform.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            The app informs decisions; it doesn&rsquo;t make them
          </h2>
          <p className="mt-2">
            Breeding recommendations, inbreeding warnings, gestation dates, and health alerts are
            calculated from the data you enter and the thresholds you set in Farm Settings. They are
            decision support, not veterinary or breeding advice — the judgment of your own veterinarian
            and your own experience should always take priority over what a screen tells you. We aren&rsquo;t
            liable for husbandry, breeding, or financial outcomes that follow from relying on the app
            instead of professional judgment.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Account termination</h2>
          <p className="mt-2">
            You can delete your own account at any time from Settings — see the Privacy Policy for what
            that removes. We can suspend an account that abuses the platform, attempts to access another
            farm&rsquo;s data, or violates these terms.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Changes to these terms</h2>
          <p className="mt-2">
            If these terms change materially, we&rsquo;ll notify account Admins by email before the change
            takes effect.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Contact</h2>
          <p className="mt-2">
            Questions about these terms: <strong>[support email]</strong>.
          </p>
        </section>
      </Card>
    </div>
  );
}
