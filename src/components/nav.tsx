"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { CurrentUser, Role } from "@/lib/auth";

type NavItem = {
  href: string;
  label: string;
  /** Roles that may see the link. Omitted means everyone signed in. */
  roles?: Role[];
};

/**
 * Nav visibility is a convenience, not a permission boundary — every page and
 * Server Action re-checks with `requireRole()`. Hiding a link the user cannot
 * use just keeps the bar honest about what they can do.
 */
const ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/animals", label: "Animals" },
  { href: "/batches", label: "Batches" },
  { href: "/breeding", label: "Breeding" },
  { href: "/health", label: "Health" },
  { href: "/feed", label: "Feed" },
  { href: "/pens", label: "Pens" },
  { href: "/finance", label: "Finance", roles: ["ADMIN", "MANAGER"] },
  { href: "/reports", label: "Reports" },
  { href: "/equipment", label: "Equipment", roles: ["ADMIN", "MANAGER"] },
  { href: "/settings", label: "Settings", roles: ["ADMIN", "MANAGER"] },
];

export function Nav({ user }: { user: CurrentUser }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const visible = ITEMS.filter((item) => !item.roles || item.roles.includes(user.role));

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold text-zinc-900 dark:text-zinc-50">
          <span aria-hidden="true">🐷</span>
          <span>Farm</span>
        </Link>

        <nav className="ml-4 hidden flex-1 items-center gap-1 md:flex">
          {visible.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive(item.href)
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-right text-xs leading-tight text-zinc-500 sm:block dark:text-zinc-400">
            <span className="block font-medium text-zinc-700 dark:text-zinc-300">{user.name}</span>
            <span>{user.role.charAt(0) + user.role.slice(1).toLowerCase()}</span>
          </span>
          <form action="/auth/sign-out" method="post">
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Sign out
            </button>
          </form>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label="Toggle navigation"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm md:hidden dark:border-zinc-700"
          >
            ☰
          </button>
        </div>
      </div>

      {open ? (
        <nav className="border-t border-zinc-200 px-4 py-2 md:hidden dark:border-zinc-800">
          <ul className="grid grid-cols-2 gap-1">
            {visible.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={`block rounded-md px-3 py-2 text-sm font-medium ${
                    isActive(item.href)
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
