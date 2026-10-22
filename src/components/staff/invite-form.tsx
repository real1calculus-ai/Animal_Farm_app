"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  EMPTY_INVITE_STATE,
  type InviteActionState,
} from "@/components/staff/invite-form-state";
import { ROLE_LABELS, optionsFrom } from "@/lib/labels";

const ROLE_OPTIONS = optionsFrom(ROLE_LABELS);

/**
 * Invite form, plus the one-time display of the resulting link.
 *
 * The link is built here from `window.location.origin` rather than passed down
 * from the server: there is no configured public base URL, and guessing one in
 * an environment variable that nobody sets produces invitations pointing at
 * localhost in production.
 */
export function InviteForm({
  action,
  canInviteAdmin,
}: {
  action: (state: InviteActionState, formData: FormData) => Promise<InviteActionState>;
  canInviteAdmin: boolean;
}) {
  const formId = useId();
  const [state, formAction] = useActionState(action, EMPTY_INVITE_STATE);
  const [copied, setCopied] = useState(false);

  const link = state.created
    ? `${typeof window === "undefined" ? "" : window.location.origin}/signup?invite=${state.created.token}`
    : null;

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Clipboard access is refused in plenty of mobile browsers. The link is
      // on screen and selectable, so there is nothing to recover from.
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <Field label="Email" htmlFor={`${formId}-email`} required className="sm:flex-1">
          <Input
            id={`${formId}-email`}
            name="email"
            type="email"
            autoComplete="off"
            autoCapitalize="none"
            required
            placeholder="worker@example.com"
          />
        </Field>

        <Field label="Role" htmlFor={`${formId}-role`} required>
          <Select id={`${formId}-role`} name="role" required defaultValue="WORKER">
            {ROLE_OPTIONS.filter(
              (option) => canInviteAdmin || option.value !== "ADMIN"
            ).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <SubmitButton>Create invitation</SubmitButton>
      </form>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300"
        >
          {state.error}
        </p>
      ) : null}

      {state.created && link ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/50">
          <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
            Invitation ready for {state.created.email}
          </p>
          <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-300">
            Send them this link. It only works for that email address, and it is shown once —
            close this page and you will have to issue a new one.
          </p>
          <code className="mt-2 block overflow-x-auto rounded border border-emerald-200 bg-white px-2 py-1.5 text-xs text-zinc-700 dark:border-emerald-900 dark:bg-zinc-950 dark:text-zinc-300">
            {link}
          </code>
          <Button type="button" variant="secondary" onClick={copy} className="mt-2">
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
