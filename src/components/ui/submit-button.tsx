"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * Drop-in replacement for `<Button type="submit">` inside a plain
 * `<form action={serverAction}>` — the 19 pages in this app that use that
 * shape had zero client-side pending state at all, so nothing stopped a
 * fast double-tap from firing the server action twice (a double stock
 * adjustment, a double customer create, etc.). `useFormStatus()` reads
 * `pending` from the nearest enclosing `<form>` automatically — no action
 * reference or prop drilling needed, it just works by being rendered
 * inside the form. Disabled while pending (via `Button`'s existing
 * `disabled:opacity-50 disabled:pointer-events-none` styling) and shows a
 * spinner + the given pending label so a tap that registered is
 * unmistakable, not just a button that quietly stopped responding.
 */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending && <Spinner className="h-4 w-4" />}
      {pending ? (pendingLabel ?? "Saving...") : children}
    </Button>
  );
}
