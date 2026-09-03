import Link from "next/link";
import type { Role } from "@/lib/auth";

/**
 * Section nav for the feed module. The top-level nav has one "Feed" entry;
 * this is what makes the eight screens behind it reachable one-handed without
 * a menu dive. Links a worker cannot use are hidden — the actions themselves
 * re-check with `requireRole`, so this is only about not offering dead ends.
 */
const TABS: { href: string; label: string; roles?: Role[] }[] = [
  { href: "/feed", label: "Inventory" },
  { href: "/feed/records", label: "Feeding log" },
  { href: "/feed/batches", label: "Batches" },
  { href: "/feed/deliveries", label: "Deliveries", roles: ["ADMIN", "MANAGER"] },
  { href: "/feed/programs", label: "Programmes", roles: ["ADMIN", "MANAGER"] },
  { href: "/feed/types", label: "Feed types", roles: ["ADMIN", "MANAGER"] },
  { href: "/feed/suppliers", label: "Suppliers", roles: ["ADMIN", "MANAGER"] },
  { href: "/feed/storage", label: "Storage", roles: ["ADMIN", "MANAGER"] },
  { href: "/feed/analysis", label: "Analysis" },
];

export function FeedSubnav({ active, role }: { active: string; role: Role }) {
  const visible = TABS.filter((tab) => !tab.roles || tab.roles.includes(role));

  return (
    <nav className="mb-6 -mx-4 overflow-x-auto px-4">
      <ul className="flex min-w-max items-center gap-1 border-b border-zinc-200 pb-px dark:border-zinc-800">
        {visible.map((tab) => {
          const isActive = tab.href === active;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={`inline-block whitespace-nowrap rounded-t-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-50"
                    : "border-b-2 border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
