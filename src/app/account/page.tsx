import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteOwnAccount } from "@/app/account/actions";
import { ROLE_LABELS } from "@/lib/labels";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * Every approved user's own account page — distinct from /settings, which is
 * the farm's settings and Admin/Manager only. Read-only profile summary plus
 * the one action every role needs regardless of permission level: deleting
 * their own account (Apple Guideline 5.1.1(v)).
 */
export default async function AccountPage() {
  const user = await requireUser();

  let otherMembers = 0;
  let isLastAdminBlocked = false;
  if (user.farmId) {
    otherMembers = await prisma.profile.count({
      where: { farmId: user.farmId, id: { not: user.id } },
    });
    if (otherMembers > 0 && user.role === "ADMIN") {
      const otherAdmins = await prisma.profile.count({
        where: { farmId: user.farmId, role: "ADMIN", approved: true, id: { not: user.id } },
      });
      isLastAdminBlocked = otherAdmins === 0;
    }
  }
  const isSoleMember = Boolean(user.farmId) && otherMembers === 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="My account" description="Your own profile and account controls." />

      <Card className="max-w-xl">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-zinc-500 dark:text-zinc-400">Name</dt>
          <dd className="text-zinc-900 dark:text-zinc-50">{user.name}</dd>
          <dt className="text-zinc-500 dark:text-zinc-400">Email</dt>
          <dd className="text-zinc-900 dark:text-zinc-50">{user.email}</dd>
          <dt className="text-zinc-500 dark:text-zinc-400">Role</dt>
          <dd className="text-zinc-900 dark:text-zinc-50">{ROLE_LABELS[user.role]}</dd>
        </dl>
      </Card>

      <Card className="max-w-xl border-red-200 dark:border-red-900/60">
        <h2 className="text-base font-semibold text-red-700 dark:text-red-400">Delete account</h2>

        {isLastAdminBlocked ? (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            You&rsquo;re the only administrator on a farm with other staff. Promote someone else to
            Administrator on the{" "}
            <a href="/staff" className="underline">
              Staff
            </a>{" "}
            page before deleting your account, or nobody will be left who can manage it.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {isSoleMember
                ? "You're the only member of this farm. Deleting your account deletes the whole " +
                  "farm and everything recorded in it — animals, health and breeding history, " +
                  "feed, and financial records. This cannot be undone."
                : "This removes your profile and sign-in. Records you contributed (health entries, " +
                  "transactions, and so on) stay attached to the farm's history, the way a paper " +
                  "logbook keeps an entry after the person who wrote it leaves. This cannot be undone."}
            </p>

            <form action={deleteOwnAccount} className="mt-4 flex flex-col gap-3">
              <Field
                label={`Type your email (${user.email}) to confirm`}
                htmlFor="confirmEmail"
                required
              >
                <Input
                  id="confirmEmail"
                  name="confirmEmail"
                  type="email"
                  required
                  autoComplete="off"
                  placeholder={user.email}
                />
              </Field>
              <SubmitButton
                variant="danger"
                className="self-start"
                pendingLabel="Deleting…"
              >
                Delete my account
              </SubmitButton>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
