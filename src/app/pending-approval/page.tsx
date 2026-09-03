import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Card } from "@/components/ui/card";

/**
 * Where `requireUser()` sends a signed-in but unapproved account. It is the
 * only screen such a user can reach, so it has to explain the wait rather than
 * look like a failure — the first user on a fresh install is auto-approved, so
 * anyone landing here has an Admin who can let them in.
 *
 * Uses getCurrentUser(), not requireUser(): requireUser() redirects unapproved
 * users *here*, which from this page would be an infinite loop.
 */
export default async function PendingApprovalPage() {
  const user = await getCurrentUser();

  if (!user) redirect("/login");
  // Already approved — nothing to wait for.
  if (user.approved) redirect("/");

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center">
      <Card className="flex flex-col gap-4 text-center">
        <p className="text-3xl" aria-hidden="true">
          ⏳
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Your account is waiting for approval
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Your account was created with the email{" "}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">{user.email}</span>. A farm
          administrator needs to approve it and choose your role before you can see any farm
          records.
        </p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Ask whoever runs the farm to open <span className="font-medium">Staff</span> and approve
          you. Once they do, sign in again and you&apos;ll go straight to the dashboard.
        </p>

        {/* The nav is hidden for unapproved users (see src/app/layout.tsx), so
            this page carries its own way out — otherwise the only escape from
            a wrong-account signup is clearing cookies by hand. */}
        <form action="/auth/sign-out" method="post" className="mt-2">
          <button
            type="submit"
            className="w-full rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Sign out
          </button>
        </form>
      </Card>
    </div>
  );
}
