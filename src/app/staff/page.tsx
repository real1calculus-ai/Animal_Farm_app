import { ADMIN_ROLES, requireRole } from "@/lib/auth";
import { getActiveFarmId } from "@/lib/active-farm";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { ROLE_LABELS, optionsFrom } from "@/lib/labels";
import { approveStaff, removeStaff, updateStaffRole } from "@/app/staff/actions";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { EmptyState } from "@/components/ui/empty-state";
import type { Role } from "@prisma/client";

const ROLE_BADGE: Record<Role, NonNullable<BadgeProps["variant"]>> = {
  ADMIN: "success",
  MANAGER: "default",
  VETERINARIAN: "warning",
  WORKER: "default",
};

const ROLE_OPTIONS = optionsFrom(ROLE_LABELS);

/**
 * Staff roster for the farm. The controls here mirror the guards in
 * ./actions.ts — a row the caller may not act on renders an explanation
 * instead of a disabled control, so it is clear *why* rather than just dead.
 * The actions re-check everything regardless; this is courtesy, not security.
 */
export default async function StaffPage() {
  const currentUser = await requireRole(ADMIN_ROLES);
  const farmId = await getActiveFarmId(currentUser);

  const staff = await prisma.profile.findMany({
    // Unattached profiles (a signup that arrived before any farm existed) are
    // included so they can be approved rather than stranded — see loadTarget.
    where: { OR: [{ farmId }, { farmId: null }] },
    orderBy: [{ approved: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      approved: true,
      createdAt: true,
    },
  });

  const pending = staff.filter((member) => !member.approved);
  const active = staff.filter((member) => member.approved);
  const adminCount = active.filter((member) => member.role === "ADMIN").length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Staff"
        description="Who can sign in to this farm, and what each of them is allowed to do."
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Waiting for approval
          {pending.length > 0 ? (
            <Badge variant="warning" className="ml-2 align-middle">
              {pending.length}
            </Badge>
          ) : null}
        </h2>

        {pending.length === 0 ? (
          <EmptyState
            title="Nobody is waiting"
            description="New accounts created at the sign-up page appear here until you approve them and choose a role."
          />
        ) : (
          <Card className="p-0 sm:p-6">
            <Table>
              <Thead>
                <Tr>
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Signed up</Th>
                  <Th>Approve as</Th>
                  <Th className="text-right">Remove</Th>
                </Tr>
              </Thead>
              <Tbody>
                {pending.map((member) => (
                  <Tr key={member.id}>
                    <Td className="font-medium text-zinc-900 dark:text-zinc-50">{member.name}</Td>
                    <Td className="text-zinc-500 dark:text-zinc-400">{member.email}</Td>
                    <Td className="whitespace-nowrap">{formatDate(member.createdAt)}</Td>
                    <Td>
                      <form
                        action={approveStaff.bind(null, member.id)}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <Select
                          name="role"
                          aria-label={`Role for ${member.name}`}
                          defaultValue="WORKER"
                          className="w-auto py-1.5"
                        >
                          {ROLE_OPTIONS.map((option) => (
                            <option
                              key={option.value}
                              value={option.value}
                              // Only an Admin can create another Admin; the
                              // action refuses it either way.
                              disabled={option.value === "ADMIN" && currentUser.role !== "ADMIN"}
                            >
                              {option.label}
                            </option>
                          ))}
                        </Select>
                        <SubmitButton className="px-3 py-1.5" pendingLabel="Approving…">
                          Approve
                        </SubmitButton>
                      </form>
                    </Td>
                    <Td className="text-right">
                      <form action={removeStaff.bind(null, member.id)}>
                        <SubmitButton
                          variant="danger"
                          className="px-3 py-1.5"
                          pendingLabel="Removing…"
                        >
                          Reject
                        </SubmitButton>
                      </form>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Active staff</h2>

        {active.length === 0 ? (
          <EmptyState
            title="No active staff yet"
            description="Approve someone above and they'll appear here."
          />
        ) : (
          <Card className="p-0 sm:p-6">
            <Table>
              <Thead>
                <Tr>
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Role</Th>
                  <Th>Change role</Th>
                  <Th className="text-right">Remove</Th>
                </Tr>
              </Thead>
              <Tbody>
                {active.map((member) => {
                  const isSelf = member.id === currentUser.id;
                  const isLastAdmin = member.role === "ADMIN" && adminCount <= 1;
                  const outranksActor = member.role === "ADMIN" && currentUser.role !== "ADMIN";
                  const locked = isSelf || isLastAdmin || outranksActor;

                  const reason = isSelf
                    ? "That's you"
                    : isLastAdmin
                      ? "Only administrator"
                      : outranksActor
                        ? "Administrator"
                        : null;

                  return (
                    <Tr key={member.id}>
                      <Td className="font-medium text-zinc-900 dark:text-zinc-50">
                        {member.name}
                        {isSelf ? (
                          <span className="ml-2 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                            you
                          </span>
                        ) : null}
                      </Td>
                      <Td className="text-zinc-500 dark:text-zinc-400">{member.email}</Td>
                      <Td>
                        <Badge variant={ROLE_BADGE[member.role]}>{ROLE_LABELS[member.role]}</Badge>
                      </Td>
                      <Td>
                        {locked ? (
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">{reason}</span>
                        ) : (
                          <form
                            action={updateStaffRole.bind(null, member.id)}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <Select
                              name="role"
                              aria-label={`Role for ${member.name}`}
                              defaultValue={member.role}
                              className="w-auto py-1.5"
                            >
                              {ROLE_OPTIONS.map((option) => (
                                <option
                                  key={option.value}
                                  value={option.value}
                                  disabled={
                                    option.value === "ADMIN" && currentUser.role !== "ADMIN"
                                  }
                                >
                                  {option.label}
                                </option>
                              ))}
                            </Select>
                            <SubmitButton
                              variant="secondary"
                              className="px-3 py-1.5"
                              pendingLabel="Saving…"
                            >
                              Save
                            </SubmitButton>
                          </form>
                        )}
                      </Td>
                      <Td className="text-right">
                        {locked ? (
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">—</span>
                        ) : (
                          <form action={removeStaff.bind(null, member.id)}>
                            <SubmitButton
                              variant="danger"
                              className="px-3 py-1.5"
                              pendingLabel="Removing…"
                            >
                              Remove
                            </SubmitButton>
                          </form>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </Card>
        )}

        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          You can&apos;t change your own role or remove yourself, and the farm&apos;s last
          administrator can&apos;t be demoted or removed — those are the two ways an operator
          locks themselves out of their own records.
        </p>
      </section>
    </div>
  );
}
