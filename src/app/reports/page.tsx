import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";

/**
 * Each report is described by the decision it supports rather than the data it
 * contains. "Litter size trend" tells you nothing about when to open it;
 * "whether a sow is worth keeping" does.
 */
const REPORTS = [
  {
    href: "/reports/breeding",
    title: "Breeding performance",
    decision: "Which sows and boars are earning their feed, and whether litter quality is holding.",
  },
  {
    href: "/reports/growth",
    title: "Growth performance",
    decision: "Whether animals are reaching weight on schedule, and which pens are lagging.",
  },
  {
    href: "/reports/health",
    title: "Health & antibiotics",
    decision: "What is making animals sick, what it costs, and whether antibiotic use is falling.",
  },
  {
    href: "/reports/feed",
    title: "Feed & conversion",
    decision: "What feed costs per kilo of gain, and which supplier is actually cheaper.",
  },
  {
    href: "/reports/genetics",
    title: "Genetic diversity",
    decision: "Whether the herd is quietly closing its own gene pool, and when to bring in new blood.",
  },
] as const;

export default async function ReportsIndexPage() {
  await requireUser();

  return (
    <>
      <PageHeader title="Reports" description="Production, health and genetics analysis." />

      <div className="grid gap-4 sm:grid-cols-2">
        {REPORTS.map((report) => (
          <Card key={report.href}>
            <h2 className="font-medium">
              <Link href={report.href} className="underline underline-offset-2">
                {report.title}
              </Link>
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{report.decision}</p>
          </Card>
        ))}
      </div>
    </>
  );
}
