import Link from "next/link";

const LINKS = [
  { href: "/finance", label: "Overview" },
  { href: "/finance/transactions", label: "Transactions" },
  { href: "/finance/sales", label: "Animal sales" },
  { href: "/finance/profitability", label: "Profitability" },
] as const;

export function FinanceSubnav({ current }: { current: string }) {
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b border-zinc-200 pb-2 dark:border-zinc-800">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={link.href === current ? "page" : undefined}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            link.href === current
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          }`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
